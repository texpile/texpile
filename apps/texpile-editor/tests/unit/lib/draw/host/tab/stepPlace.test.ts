import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { stepTouches } from '$lib/draw/host/tab/stepPlace';

const FILE = 'Text before.\n\\begin{tikzpicture}\\node {A};\\end{tikzpicture}\nText after.\n';
const PICTURE = { from: FILE.indexOf('\\begin'), to: FILE.indexOf('\nText after') };

function file(): { ytext: Y.Text; undo: Y.UndoManager } {
	const ytext = new Y.Doc().getText('main.tex');
	ytext.insert(0, FILE);
	const undo = new Y.UndoManager(ytext, { captureTimeout: 0 });
	return { ytext, undo };
}

describe('where the step an undo takes back lands', () => {
	it('is outside the picture for typing in the text after it', () => {
		const { ytext, undo } = file();
		ytext.insert(FILE.indexOf('after'), 'still ');
		expect(stepTouches(undo, 'undo', ytext, PICTURE)).toBe(false);
	});

	it('is in the picture for text typed or deleted in it', () => {
		const typed = file();
		typed.ytext.insert(FILE.indexOf('{A}') + 1, 'B');
		expect(stepTouches(typed.undo, 'undo', typed.ytext, { ...PICTURE, to: PICTURE.to + 1 })).toBe(true);
		const deleted = file();
		deleted.ytext.delete(FILE.indexOf('{A}') + 1, 1);
		expect(stepTouches(deleted.undo, 'undo', deleted.ytext, { ...PICTURE, to: PICTURE.to - 1 })).toBe(true);
	});

	it('checks the step a redo brings back', () => {
		const { ytext, undo } = file();
		ytext.insert(0, 'New. ');
		undo.undo();
		expect(stepTouches(undo, 'redo', ytext, PICTURE)).toBe(false);
	});
});
