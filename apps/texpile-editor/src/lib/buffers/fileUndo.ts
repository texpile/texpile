// one file's undo history for every editor on it; a review decision is a step in a map of its own
import * as Y from 'yjs';
import { DISK_ORIGIN, EDIT_ORIGIN } from '$lib/collab/sharedFiles';
import { decisionStepped } from '$lib/comments/decisionHistory';

const DECISION_ORIGIN = 'decision';
const LINKED = 'linked';

/** what other files do when this file's step is undone or redone (a rename across files, as in VS Code) */
export type LinkedStep = { undo: () => void; redo: () => void };
/** past this the oldest steps go: each one keeps the text it deleted alive */
const MAX_STEPS = 500;

export function createFileUndo(text: Y.Text, key: string): Y.UndoManager {
	// each side its own map: a session syncs the doc, and a peer's decisions are not steps here
	const decisions = text.doc!.getMap<number>(`decisions:${text.doc!.clientID}:${key}`);
	const um = new Y.UndoManager([text, decisions], { trackedOrigins: new Set([EDIT_ORIGIN, DISK_ORIGIN, DECISION_ORIGIN]) });
	um.on('stack-item-added', ({ stackItem }) => {
		// the step an undo or redo makes carries the decision of the step it replays
		const seq = um.currStackItem?.meta.get('decision');
		if (typeof seq === 'number') stackItem.meta.set('decision', seq);
		const linked = um.currStackItem?.meta.get(LINKED);
		if (linked) stackItem.meta.set(LINKED, linked);
		if (um.undoStack.length > MAX_STEPS) forget(um, um.undoStack.shift()!);
	});
	um.on('stack-item-popped', ({ stackItem, type }) => {
		const seq = stackItem.meta.get('decision');
		if (typeof seq === 'number') decisionStepped({ seq, undone: type === 'undo' });
		(stackItem.meta.get(LINKED) as LinkedStep | undefined)?.[type]();
	});
	return um;
}

/** a step past the cap goes, and with it the deleted text it kept for its undo */
function forget(um: Y.UndoManager, step: { deletions: Parameters<typeof Y.tryGc>[0] }): void {
	um.doc.transact((tr) =>
		Y.iterateDeletedStructs(tr, step.deletions, (struct) => {
			for (
				let item: Y.Item | null = struct instanceof Y.Item ? struct : null;
				item?.keep;
				item = (item.parent as Y.AbstractType<unknown>)._item
			)
				item.keep = false;
		})
	);
	Y.tryGc(step.deletions, um.doc.store, um.doc.gcFilter);
}

/** the deleted text every history in `doc` kept goes: what a session sends must not hold words taken out before it */
export function forgetDeleted(doc: Y.Doc, histories: Y.UndoManager[]): void {
	for (const um of histories) um.clear();
	Y.tryGc(Y.createDeleteSetFromStructStore(doc.store), doc.store, doc.gcFilter);
}

/** runs `change` as a step of its own; `link` then ties other files to it, null when the change made no step */
export async function ownStep<T>(
	um: Y.UndoManager,
	change: () => Promise<T>
): Promise<{ result: T; link: ((linked: LinkedStep) => void) | null }> {
	um.stopCapturing();
	const before = um.undoStack.length;
	const result = await change();
	um.stopCapturing();
	const step = um.undoStack.length > before ? um.undoStack[um.undoStack.length - 1] : null;
	return { result, link: step && ((linked) => step.meta.set(LINKED, linked)) };
}

/** record the decision numbered `seq` as its own step */
export function markDecision(um: Y.UndoManager, seq: number): void {
	const decisions = um.scope.find((t) => t instanceof Y.Map) as Y.Map<number> | undefined;
	if (!decisions) return;
	um.stopCapturing();
	decisions.doc!.transact(() => decisions.set(String(seq), seq), DECISION_ORIGIN);
	um.undoStack[um.undoStack.length - 1]?.meta.set('decision', seq);
	um.stopCapturing();
}

/** a change that settles the last step (the parse tidying an edit) undoes with that step; with no step to join, or a
 *  redo waiting that a new step would clear, it is no step at all */
export function joinLastStep(um: Y.UndoManager, change: () => void): void {
	if (um.undoStack.length && !um.redoStack.length) {
		/* eslint-disable no-param-reassign -- yjs merges into the last step only while lastChange is recent */
		const last = um.lastChange;
		um.lastChange = Date.now();
		try {
			change();
		} finally {
			um.lastChange = last;
		}
		/* eslint-enable no-param-reassign */
		return;
	}
	const tracked = [...um.trackedOrigins];
	um.trackedOrigins.clear();
	try {
		change();
	} finally {
		for (const origin of tracked) um.trackedOrigins.add(origin);
	}
}
