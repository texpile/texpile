// the file's one history: mathlive's own would step the formula alone, out of step with the document
import { historyKeyOf, redoVisual, undoVisual } from '$lib/editor/visual/visualUndo';

/** steps the file's history for an undo or redo key pressed in a field; false for any other key */
// the field gives up the keys first: a focused field writes back what it shows, and the step may move or replace its node
export function stepHistoryFromField(event: KeyboardEvent, leaveField: () => void): boolean {
	const step = historyKeyOf(event);
	if (!step) return false;
	event.preventDefault();
	event.stopImmediatePropagation();
	leaveField();
	if (step === 'undo') undoVisual();
	else redoVisual();
	return true;
}
