import { historyKeyOf, redoVisual, undoVisual } from '$lib/editor/visual/visualUndo';

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
