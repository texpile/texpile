// comments and suggestions carried through a change to a file that is not open
import { relativeTo } from '$lib/comments/store.svelte';
import type { EditMode } from '$lib/comments/suggestCompare';
import type { CommentsController } from '../commentsController.svelte';
import { insertedSpans, type TextEdit } from './textEdits';
import { carriedAnchors } from '../threadPlacement';

/** in suggestion mode the change becomes a suggestion, as in the open file; undoing a replace is a plain edit */
export async function carryClosedEdit(
	ctl: CommentsController,
	root: string | null,
	mode: EditMode,
	change: { path: string; before: string; after: string; edits: TextEdit[]; undoing: boolean }
): Promise<void> {
	if (!root || !ctl.store.writable) return;
	const file = relativeTo(root, change.path);
	if (file === ctl.activeFile) return;
	const { before, after, edits } = change;
	const by = await ctl.author();
	await ctl.suggestions.remoteEdit(file, before, after, { by, mode: change.undoing ? 'editing' : mode, gestures: insertedSpans(edits) });
	await ctl.suggestions.beforeWrite(file, after);
	for (const { id, anchor } of carriedAnchors(ctl.store.forFile(file), before, after, edits)) {
		const thread = ctl.store.threads.find((t) => t.id === id);
		if (thread) await ctl.moveAnchor(thread, anchor, file, by);
	}
}
