import * as Y from 'yjs';

type TextRange = { from: number; to: number };

function offsetOf(doc: Y.Doc, ytext: Y.Text, client: number, clock: number): number | null {
	try {
		const at = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON({ item: { client, clock } }), doc);
		return at?.type === ytext ? at.index : null;
	} catch {
		return null;
	}
}

/** whether the step Undo or Redo would take back changes text in `range`; null when there is no step. Deleted text is
 *  placed where it was */
export function stepTouches(history: Y.UndoManager, which: 'undo' | 'redo', ytext: Y.Text, range: TextRange): boolean | null {
	const step = (which === 'undo' ? history.undoStack : history.redoStack).at(-1);
	const doc = ytext.doc;
	if (!step || !doc) return null;
	for (const set of [step.insertions, step.deletions])
		for (const [client, runs] of set.clients)
			for (const run of runs) {
				const from = offsetOf(doc, ytext, client, run.clock);
				const to = offsetOf(doc, ytext, client, run.clock + run.len - 1);
				if (from !== null && to !== null && Math.min(from, to) <= range.to && Math.max(from, to) >= range.from) return true;
			}
	return false;
}
