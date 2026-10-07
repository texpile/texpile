// The "you have unsaved changes" gate, used in two shapes that share one modal.
//
// 1. File switch: with autosave held off (the file was deleted on disk, or a conflict was put
//    off), the outgoing file's edit was never written, so we park the switch and ask first. Save writes it and continues, Discard drops it and continues, Cancel
//    aborts the switch entirely and leaves the edit intact on the current file.
// 2. Workspace level (folder switch, workspace close, window close): same modal, but the answer
//    goes back to the caller as a promise and the file-switch parking machinery is skipped.
//
// The distinction is carried by `prompt.resolve` being set; loadFile's effect keys off it to park
// ALL file switches while a workspace-level prompt is up, so the answer applies to the file asked about.
import { activeFilePath } from '$lib/workspace/workspaceStore';
import { tabs } from '$lib/workspace/tabs.svelte';
import { basename } from '$lib/workspace/fileSystem';
import type { FileWriter } from '$lib/workspace/fileWriter';
import { promptAsk } from '$lib/modals/confirm.svelte';
import { m } from '$lib/paraglide/messages';

type Choice = 'save' | 'discard' | 'cancel';

export type UnsavedGuardDeps = {
	writer: FileWriter;
	getLoadedPath(): string | null;
	autosaveActive(): boolean;
	/** a tab-close that triggered this switch, cancelled alongside it */
	takePendingTabClose(): string | null;
	clearPendingTabClose(): void;
};

export class UnsavedGuard {
	/** the file asked about; non-null while the dialog is up */
	prompt = $state<{
		name: string;
		path: string;
		resolve?: (choice: Choice) => void;
	} | null>(null);

	/** a switch held back by the dialog: the store reverts to the outgoing file (tabs and tree stay
	 * visually on it) and this carries where the user was headed */
	held: { target: string | null } | null = null;

	onDiscard: ((path: string) => void) | null = null;

	constructor(private deps: UnsavedGuardDeps) {}

	/** true while a workspace-level prompt is up */
	get parksAllSwitches(): boolean {
		return !!this.prompt?.resolve;
	}

	private unsaved(): string | null {
		const loaded = this.deps.getLoadedPath();
		return !this.deps.autosaveActive() && loaded && this.deps.writer.isDirty(loaded) ? loaded : null;
	}

	/** does switching away from the current file need to ask first? */
	needsPromptFor(nextPath: string | null): boolean {
		const loaded = this.unsaved();
		return !!loaded && nextPath !== loaded;
	}

	/** park the switch and raise the dialog; the caller has already decided it is needed */
	beginFileSwitch(target: string | null): void {
		const loaded = this.deps.getLoadedPath();
		if (!loaded) return;
		this.held = { target };
		activeFilePath.current = loaded;
		this.prompt = { name: basename(loaded), path: loaded };
	}

	/** workspace-level guard; resolves true to proceed (Save writes first), false on Cancel */
	confirmLeave(): Promise<boolean> {
		const loaded = this.unsaved();
		if (!loaded) return this.confirmStranded();
		return new Promise((resolve) => {
			this.prompt = {
				name: basename(loaded),
				path: loaded,
				resolve: (choice) => {
					if (choice === 'cancel') return resolve(false);
					this.answer(loaded, choice);
					resolve(this.confirmStranded());
				}
			};
		});
	}

	/** edits in files that are not open, held back by a change on disk: nothing else on screen asks about them */
	private async confirmStranded(): Promise<boolean> {
		await this.deps.writer.flushAndWait();
		const stranded = this.deps.writer.stranded();
		if (!stranded.length) return true;
		const choice = await promptAsk({
			title: m.wsview_stranded_title(),
			message: m.wsview_stranded_body({ names: stranded.map(basename).join(', ') }),
			buttons: [
				{ id: 'discard', label: m.wsview_stranded_discard() },
				{ id: 'cancel', label: m.wsview_cancel_label(), primary: true }
			],
			cancelId: 'cancel'
		});
		if (choice !== 'discard') return false;
		for (const path of stranded) this.deps.writer.revert(path);
		return true;
	}

	private answer(path: string, choice: 'save' | 'discard'): void {
		if (choice === 'save') void this.deps.writer.save(path);
		else {
			this.deps.writer.revert(path);
			this.onDiscard?.(path);
		}
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
			this.deps.clearPendingTabClose();
			this.held = null;
			return;
		}
		this.answer(prompt.path, choice);
		const closing = this.deps.takePendingTabClose();
		if (closing) tabs.close(closing);
		const target = this.held?.target ?? null;
		this.held = null;
		if (target !== activeFilePath.current) activeFilePath.current = target;
	}
}
