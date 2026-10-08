// Undo and redo in the visual editor, for every key and menu that offers them: the open file's own
// history (the buffers' undo manager, which source mode and the disk share), stepped by the visual
// collab layer, which binds it while a file is open
let stepper: ((dir: 'undo' | 'redo') => boolean) | null = null;

export function bindVisualUndo(step: ((dir: 'undo' | 'redo') => boolean) | null): void {
	stepper = step;
}

// consumed even at the stack edge, so the browser's own undo never runs
export function undoVisual(): boolean {
	stepper?.('undo');
	return true;
}

export function redoVisual(): boolean {
	stepper?.('redo');
	return true;
}
