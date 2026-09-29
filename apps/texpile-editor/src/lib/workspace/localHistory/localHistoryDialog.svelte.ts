// Which Local History dialog is open (LocalHistoryDialog.svelte), drawn by the workspace: one file's
// copies, from the File menu, a file's or tab's right-click menu and the palette; or the deleted
// files under a folder with copies left, from Restore Deleted File.
export type LocalHistoryView = { kind: 'file'; path: string } | { kind: 'deleted'; under: string };

let view = $state<LocalHistoryView | null>(null);

export const localHistoryDialog = {
	get view(): LocalHistoryView | null {
		return view;
	}
};

export function openLocalHistory(path: string): void {
	view = { kind: 'file', path };
}

/** `under`: the project, or the folder that was right-clicked */
export function openRestoreDeleted(under: string): void {
	view = { kind: 'deleted', under };
}

export function closeLocalHistory(): void {
	view = null;
}
