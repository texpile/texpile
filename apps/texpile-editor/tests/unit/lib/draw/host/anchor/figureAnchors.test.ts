import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { figureFor, placeOf } from '$lib/draw/host/anchor/figureAnchors';

const PICTURE = '\\begin{tikzpicture}\n\\node (a) at (0,0) {A};\n\\end{tikzpicture}';
const FILE = `\\documentclass{article}\n\\begin{document}\nText.\n\n${PICTURE}\n\\end{document}\n`;

function fileText(): { ytext: Y.Text; undo: Y.UndoManager } {
	const ytext = new Y.Doc().getText('main.tex');
	ytext.insert(0, FILE);
	return { ytext, undo: new Y.UndoManager(ytext, { captureTimeout: 0 }) };
}

function opened(ytext: Y.Text): string {
	const text = ytext.toString();
	return figureFor('/w/main.tex', ytext, text, text.indexOf('\\begin{tikzpicture}'));
}

describe('a figure tab holds its picture by an anchor in the text', () => {
	it('keeps its picture when another is added above it', () => {
		const { ytext } = fileText();
		const id = opened(ytext);
		ytext.insert(FILE.indexOf('Text.'), '\\begin{tikzpicture}\\draw (0,0) -- (1,1);\\end{tikzpicture}\n');
		const text = ytext.toString();
		const place = placeOf(id, ytext, text);
		expect(place?.state).toBe('shown');
		expect(place?.state === 'shown' && text.slice(place.span.from, place.span.to)).toBe(PICTURE);
		expect(place?.state === 'shown' && place.number).toBe(2);
	});

	it('is deleted with its picture, and back once the deletion is undone', () => {
		const { ytext, undo } = fileText();
		const id = opened(ytext);
		ytext.delete(FILE.indexOf(PICTURE), PICTURE.length);
		expect(placeOf(id, ytext, ytext.toString())?.state).toBe('deleted');
		undo.undo();
		expect(placeOf(id, ytext, ytext.toString())?.state).toBe('shown');
	});

	it('is incomplete while its \\end is gone', () => {
		const { ytext } = fileText();
		const id = opened(ytext);
		const end = ytext.toString().indexOf('\\end{tikzpicture}');
		ytext.delete(end, '\\end{tikzpicture}'.length);
		expect(placeOf(id, ytext, ytext.toString())?.state).toBe('incomplete');
	});
});
