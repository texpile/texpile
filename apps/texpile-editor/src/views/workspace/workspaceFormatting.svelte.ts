// The compile-command dialog and the Format-document modal: opening rules, gating, and the
// run itself (latexindent for LaTeX through the provider, typstyle through tinymist).
import { CompileSettings } from '$lib/workspace/compileSettings.svelte';
import { runFormat } from '$lib/workspace/editorCommands';
import { formatTypstDocument, typstBridgeAvailable } from '$lib/languages/typst/intellisense/lspClient';
import { workspaceRoot, texFiles, mainFile } from '$lib/workspace/workspaceStore';
import type { WorkspaceProvider } from '$lib/workspace/workspaceProvider';
import type { MainFilePrompt } from '$lib/workspace/mainFilePrompt.svelte';
import type { WorkspaceDoc } from './workspaceDoc.svelte';
import type { WorkspaceCompileState } from './workspaceCompileState.svelte';
import type { CompilePipeline } from '$lib/workspace/compilePipeline.svelte';
import type { SavePipeline } from '$lib/workspace/savePipeline.svelte';

type FormattingDeps = {
	provider: WorkspaceProvider;
	wsdoc: WorkspaceDoc;
	hostMode: () => boolean;
	cc: () => WorkspaceCompileState;
	compiler: () => CompilePipeline;
	saver: () => SavePipeline;
	mainPrompt: () => MainFilePrompt;
};

export class WorkspaceFormatting {
	// compile-command dialog state lives in lib/workspace/compileSettings.svelte.ts
	readonly compileSettings: CompileSettings;
	formatModalOpen = $state(false);
	formatting = $state(false);

	constructor(private d: FormattingDeps) {
		const { cc } = d;
		this.compileSettings = new CompileSettings(
			() => cc().command,
			(c) => (cc().command = c),
			() => d.compiler().runCompile()
		);
	}

	/**
	 * Everything in the modal - the Format readout, which lane's settings show, the default
	 * command - derives from the main file, so opened without one it can only show the LaTeX
	 * fallback, which for a Typst folder is wrong on every row. Ask for the main first and open
	 * the modal after; even dismissing the picker settles the detected candidate, so what follows
	 * shows a real lane. An empty folder skips straight in - there is nothing to pick - and a
	 * guest has no main file to set (compiling is the host's).
	 */
	openCompileModal(): void {
		if (this.d.hostMode() && !mainFile.current && texFiles.current.length > 0 && !this.d.mainPrompt().open) {
			void this.d.mainPrompt().prompt(() => this.compileSettings.open());
			return;
		}
		this.compileSettings.open();
	}

	saveCompileCommand(thenRun: boolean) {
		return this.compileSettings.save(thenRun);
	}

	/**
	 * Whether Format can serve the open file. LaTeX goes through latexindent (an external tool the
	 * provider must expose); Typst goes through tinymist's built-in typstyle, gated to SOURCE mode:
	 * the formatter edits the server's in-memory document, and only the source editor's LSP binding
	 * keeps that identical to the buffer - in visual mode the server's copy is stale or closed.
	 */
	canFormatDoc(): boolean {
		const { doc, modes } = this.d.wsdoc;
		if (doc.kind === 'tex') return this.d.provider.caps.format;
		return doc.kind === 'typ' && typstBridgeAvailable() && modes.mode === 'source';
	}

	openFormatModal(): void {
		if (!this.d.wsdoc.doc.path || !this.canFormatDoc()) return;
		this.formatModalOpen = true;
	}

	runFormatNow() {
		const { doc } = this.d.wsdoc;
		this.formatModalOpen = false;
		return runFormat({
			getLoadedPath: () => doc.path,
			getSource: () => doc.texSource,
			getEol: () => doc.eol,
			flushSaves: () => this.d.saver().flushAndWait(),
			format:
				doc.kind === 'typ'
					? (p, text) => formatTypstDocument(workspaceRoot.current, p, text)
					: (p, text) => this.d.provider.format!(p, text),
			applyFormatted: (text) => doc.replaceSource(text, { dirty: true }),
			setBusy: (b) => (this.formatting = b)
		});
	}
}
