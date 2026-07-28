// The "you have unsaved changes" gate, used in two shapes that share one modal.
//
// 1. File switch: with autosave off, the outgoing file's edit was never written, so we park the
//    switch and ask first. Save writes it and continues, Discard drops it and continues, Cancel
//    aborts the switch entirely and leaves the edit intact on the current file.
// 2. Workspace level (folder switch, workspace close, window close): same modal, but the answer
//    goes back to the caller as a promise and the file-switch parking machinery is skipped.
//
// The distinction is carried by `prompt.resolve` being set; loadFile's effect keys off it to park
// ALL file switches while a workspace-level prompt is up, otherwise a Ctrl+Tab under the modal
// would reattach the pending edit against the wrong file.
import { get } from 'svelte/store';
import { activeFilePath } from '$lib/workspace/workspaceStore';
import { tabs } from '$lib/workspace/tabs.svelte';
import { basename, type Eol } from '$lib/workspace/fileSystem';
import type { SavePipeline } from '$lib/workspace/savePipeline.svelte';

type Choice = 'save' | 'discard' | 'cancel';

export interface UnsavedGuardDeps {
	/** a getter, not the instance: the guard is constructed before the pipeline exists */
	saver(): SavePipeline;
	getLoadedPath(): string | null;
	getEol(): Eol;
	autosaveActive(): boolean;
	/** a tab-close that triggered this switch, cancelled alongside it */
	takePendingTabClose(): string | null;
	clearPendingTabClose(): void;
}

export class UnsavedGuard {
	/** the modal's outgoing snapshot; non-null while the dialog is up */
	prompt = $state<{
		name: string;
		outgoing: { path: string; content: string };
		eol: Eol;
		resolve?: (choice: Choice) => void;
	} | null>(null);

	/** a switch held back by the dialog: the store reverts to the outgoing file (tabs and tree stay
	 * visually on it) and this carries where the user was headed */
	held: { target: string | null } | null = null;

	constructor(private deps: UnsavedGuardDeps) {}

	private get saver(): SavePipeline {
		return this.deps.saver();
	}

	/** true while a workspace-level prompt owns the pending edit */
	get parksAllSwitches(): boolean {
		return !!this.prompt?.resolve;
	}

	/** does switching away from the current file need to ask first? */
	needsPromptFor(nextPath: string | null): boolean {
		const loaded = this.deps.getLoadedPath();
		return !this.deps.autosaveActive() && !!loaded && nextPath !== loaded && this.saver.pending?.path === loaded;
	}

	/** park the switch and raise the dialog; the caller has already decided it is needed */
	beginFileSwitch(target: string | null): void {
		const loaded = this.deps.getLoadedPath();
		if (!loaded) return;
		const eol = this.deps.getEol(); // the outgoing file's EOL, before the switch changes it
		const outgoing = this.saver.detach()!; // so the new file's queue can't touch it
		this.held = { target };
		activeFilePath.set(loaded);
		this.prompt = { name: basename(loaded), outgoing, eol };
	}

	/** workspace-level guard; resolves true to proceed (Save writes first), false on Cancel */
	confirmLeave(): Promise<boolean> {
		const loaded = this.deps.getLoadedPath();
		if (this.deps.autosaveActive() || !loaded || this.saver.pending?.path !== loaded) return Promise.resolve(true);
		const eol = this.deps.getEol();
		const outgoing = this.saver.detach()!;
		return new Promise((resolve) => {
			this.prompt = {
				name: basename(outgoing.path),
				outgoing,
				eol,
				resolve: (choice) => {
					if (choice === 'cancel') {
						this.saver.reattach(outgoing);
						resolve(false);
						return;
					}
					if (choice === 'save') void this.saver.enqueueWithEol(outgoing.path, outgoing.content, false, eol);
					resolve(true);
				}
			};
		});
	}

	resolve(choice: Choice): void {
		const prompt = this.prompt;
		this.prompt = null;
		if (!prompt) return;
		if (prompt.resolve) {
			prompt.resolve(choice);
			return;
		}
		if (choice === 'cancel') {
			// reattach so the edit is still tracked and re-guarded next time
			this.saver.reattach(prompt.outgoing);
			this.deps.clearPendingTabClose();
			this.held = null;
			return;
		}
		if (choice === 'save') void this.saver.enqueueWithEol(prompt.outgoing.path, prompt.outgoing.content, false, prompt.eol);
		const closing = this.deps.takePendingTabClose();
		if (closing) tabs.close(closing);
		const target = this.held?.target ?? null;
		this.held = null;
		if (target !== get(activeFilePath)) activeFilePath.set(target);
	}
}
