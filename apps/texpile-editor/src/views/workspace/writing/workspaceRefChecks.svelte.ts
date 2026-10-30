// the open file's live reference checks, read again when the document around it changes
import { untrack } from 'svelte';
import { LiveRefChecks } from '$lib/workspace/document/liveRefChecks.svelte';
import type { DocumentBuffer } from '$lib/workspace/documentBuffer.svelte';
import { indexedText } from '$lib/files/index/indexedTexts';
import { fileService } from '$lib/files/service/fileService';
import { isSameFile } from '$lib/files/identity/fileUris';
import { filePathStore } from '$lib/stores/editorStore';
import { references } from '$lib/workspace/citations';
import { compileOutDir } from '$lib/workspace/compileCommand';
import { compileEngine } from '$lib/languages/latex/intellisense/packages/loadedPackages';
import { checkSwitchKey } from '$lib/languages/latex/intellisense/checks/checkSwitches';
import { activeCompare, documentMainFile, fileTree, workspaceRoot } from '$lib/workspace/workspaceStore';

/** for as long as the effect root it is called in */
export function bindRefChecks(doc: DocumentBuffer, compileCommand: () => string): void {
	const refChecks = new LiveRefChecks({
		read: (p) => indexedText(p),
		open: () => (doc.path && doc.kind === 'tex' && !activeCompare.current ? { path: doc.path, text: doc.texSource } : null),
		main: documentMainFile,
		root: () => workspaceRoot.current,
		files: () => filePathStore.current,
		knownKeys: () => new Set(references.current.map((r) => r.key)),
		outDir: () => compileOutDir(compileCommand()),
		readTexBib: async (name) => (await window.texpileTypst?.texBib?.(name)) ?? null
	});
	// what the other files hold moves only when a file, the main file or the open file does
	$effect(() => {
		void fileTree.current;
		void documentMainFile();
		void doc.path;
		void activeCompare.current;
		void references.current;
		void workspaceRoot.current;
		// the engine decides which packages the document loads
		void compileEngine();
		untrack(() => void refChecks.refresh());
	});
	// another file of the document changed: what it defines or loads may have
	$effect(() => {
		function elsewhere(path: string): boolean {
			return !doc.path || !isSameFile(path, doc.path);
		}
		const offOperations = fileService.onDidRunOperation((e) => {
			if (elsewhere(e.resource.fsPath)) void refChecks.refresh();
		});
		const offChanges = fileService.onDidFilesChange((e) => {
			if ([...e.rawAdded, ...e.rawUpdated, ...e.rawDeleted].some((r) => elsewhere(r.fsPath))) void refChecks.refresh();
		});
		return () => {
			offOperations();
			offChanges();
		};
	});
	$effect(() => {
		void doc.texSource;
		void filePathStore.current;
		void checkSwitchKey();
		return untrack(() => refChecks.schedule());
	});
	$effect(() => () => refChecks.destroy());
}
