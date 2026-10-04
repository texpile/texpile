// How Version History is opened, from the File menu, a file's or tab's right-click menu and the palette:
// one file's copies in the editor itself (VersionHistoryPanel beside its comparison), or the Restore
// Deleted File dialog on the files under a folder that are gone but have copies left
// (RestoreDeletedDialog.svelte, drawn by the workspace).
import { localHistoryActions } from './localHistoryActions.svelte';

let under = $state<string | null>(null);

export const restoreDeletedDialog = {
	/** the folder whose deleted files the dialog lists; null when it is closed */
	get under(): string | null {
		return under;
	}
};

export function openLocalHistory(path: string): void {
	void localHistoryActions.current?.open(path);
}

/** `folder`: the project, or the folder that was right-clicked */
export function openRestoreDeleted(folder: string): void {
	under = folder;
}

export function closeRestoreDeleted(): void {
	under = null;
}
