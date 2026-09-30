// The Export dialog's state and its one action. A module singleton like the Cite by DOI dialog's:
// the dialog mounts once in WorkspaceView, and the File menu, the palette and the preview toolbar
// open it by calling show().
//
// The export runs here rather than in the dialog so that closing the dialog does not lose it: a long
// image export keeps going, and its result still arrives as a toast.
import { mainFile, workspaceRoot } from '$lib/workspace/workspaceStore';
import { revealItem, underRoot } from '$lib/workspace/fileSystem';
import { getFolder, updateFolder } from '$lib/storage/workspaces';
import { toastMissingTool } from '$lib/workspace/toolMissing';
import { observe } from '$lib/runes/observe.svelte';
import { toaster } from '$lib/modals/toaster-svelte';
import { tinymistResolved, typstBridgeAvailable, typstServerGen } from '../../intellisense/lspClient';
import { requestTypstExport } from '../exportRequest';
import { DEFAULT_EXPORT_OPTIONS, exportProblems, memoryLastDir, memoryToOptions, optionsToMemory } from '../exportOptions';
import { exportTargetAvailable, pickExportTarget } from '../exportTarget';
import { runTypstExport, type ExportOutcome } from '../runTypstExport';
import type { TypstExportJob } from '../exportCommand';
import type { TypstExportOptions } from '../exportOptions.types';
import { m } from '$lib/paraglide/messages';

/** what the workspace lends the export while it is mounted (see TypstPreviewController) */
export type TypstExportContext = {
	flushSaves: () => Promise<unknown>;
	refreshTree: () => void;
};

// long enough for a print-resolution export of a book; the server dying ends the wait sooner
const EXPORT_TIMEOUT_MS = 10 * 60_000;

/** the request, abandoned if tinymist exits under it: an unanswered request only ever times out */
function untilServerExits<T>(pending: Promise<T>): Promise<T> {
	const gen = typstServerGen.current;
	let stop: (() => void) | null = null;
	const exited = new Promise<never>((_resolve, reject) => {
		stop = observe(
			() => typstServerGen.current,
			(now) => {
				if (now !== gen) reject(new Error(m.typst_export_server_exited()));
			}
		);
	});
	return Promise.race([pending, exited]).finally(() => stop?.());
}

function runOnServer(root: string, job: TypstExportJob): Promise<unknown> {
	return untilServerExits(requestTypstExport(root, job, EXPORT_TIMEOUT_MS));
}

function announce(outcome: Extract<ExportOutcome, { kind: 'done' }>): void {
	const [first] = outcome.paths;
	toaster.success({
		title: m.typst_export_done_title(),
		description: outcome.paths.length === 1 ? first : m.typst_export_done_files({ count: outcome.paths.length, folder: outcome.dir }),
		duration: 6000,
		action: { label: m.filetree_menu_reveal(), onClick: () => void revealItem(first) }
	});
}

class TypstExportState {
	open = $state(false);
	busy = $state(false);
	/** the last run's failure, shown in the dialog until an option changes */
	error = $state<string | null>(null);
	options = $state<TypstExportOptions>({ ...DEFAULT_EXPORT_OPTIONS });
	private context = $state.raw<TypstExportContext | null>(null);

	/** a host workspace whose main file is Typst, in the desktop app: every entry point asks this */
	get available(): boolean {
		return (
			!!this.context &&
			!!workspaceRoot.current &&
			/\.typ$/i.test(mainFile.current ?? '') &&
			typstBridgeAvailable() &&
			exportTargetAvailable()
		);
	}

	connect(context: TypstExportContext | null): void {
		this.context = context;
		if (!context) this.open = false;
	}

	show(): void {
		const root = workspaceRoot.current;
		if (!this.available || !root) return;
		// the folder's last choices, except while an export is still running: those are what it runs with
		if (!this.busy) this.options = memoryToOptions(getFolder(root).typstExport);
		this.error = null;
		this.open = true;
	}

	hide(): void {
		this.open = false;
	}

	update(patch: Partial<TypstExportOptions>): void {
		this.options = { ...this.options, ...patch };
		this.error = null;
	}

	async run(): Promise<void> {
		const root = workspaceRoot.current;
		const main = mainFile.current;
		const context = this.context;
		const options = this.options;
		if (this.busy || !root || !main || !context || exportProblems(options).length) return;
		this.busy = true;
		this.error = null;
		try {
			const lastDir = memoryLastDir(getFolder(root).typstExport);
			const outcome = await runTypstExport(options, {
				root,
				main,
				lastDir,
				pick: pickExportTarget,
				serverReady: tinymistResolved,
				flushSaves: context.flushSaves,
				run: (job) => runOnServer(root, job)
			});
			if (outcome.kind === 'failed' && outcome.missingTool) {
				// nothing in the dialog can fix this; the app's missing-tool toast offers the install
				this.open = false;
				await toastMissingTool('tinymist');
			} else if (outcome.kind === 'failed') this.fail(outcome.message);
			if (outcome.kind !== 'done') return;
			updateFolder(root, (draft) => {
				draft.typstExport = optionsToMemory(options, outcome.dir);
			});
			this.open = false;
			announce(outcome);
			// the workspace that lent the refresh may have closed while the export ran
			if (this.context === context && outcome.paths.some((p) => underRoot(root, p))) context.refreshTree();
		} catch (err) {
			// the platform dialog or the save, not tinymist: runTypstExport words tinymist's own failures
			console.error('typst export failed:', err);
			this.fail(err instanceof Error ? err.message : String(err));
		} finally {
			this.busy = false;
		}
	}

	/** in the dialog while it is up; a toast once it has been closed, so a failure is never silent */
	private fail(message: string): void {
		this.error = message;
		if (this.open) return;
		toaster.error({ title: m.typst_export_failed(), description: message, duration: 8000 });
	}
}

export const typstExport = new TypstExportState();
