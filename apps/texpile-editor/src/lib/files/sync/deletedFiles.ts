import { addLocalHistory } from '$lib/workspace/localHistory/localHistory.svelte';

// network shares report deletes for files that are still there, so vscode looks again before closing
const RECHECK_MS = 100;

export type DeletedFileDeps = {
	exists(path: string): Promise<boolean>;
	/** the file's text when it holds edits the disk never had */
	unsavedText(path: string): string | null;
	/** its buffers, tabs and caret go, in every pane */
	detach(path: string): void;
};

const checking = new Set<string>();

/** a file gone from disk closes everywhere, as in IntelliJ, after its unsaved text goes to Local History */
export async function closeIfDeleted(path: string, deps: DeletedFileDeps): Promise<void> {
	if (checking.has(path)) return;
	checking.add(path);
	try {
		await new Promise((r) => setTimeout(r, RECHECK_MS));
		if (await deps.exists(path).catch(() => true)) return;
		const text = deps.unsavedText(path);
		if (text !== null) await addLocalHistory(path, text, 'deleted');
		deps.detach(path);
	} finally {
		checking.delete(path);
	}
}
