import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { ensureSyntaxTree } from '@codemirror/language';
import { latex } from '$lib/languages/latex/source/latexLanguage';
import { typstLanguage } from '$lib/languages/typst/source/typstLanguage';
import { pictureStartAt } from '$lib/draw/host/sourceMarks/pictureAtCaret';

/** `syntaxTree(state)` holds only what a state's first 20 ms parsed */
function startsIn(doc: string, typst: boolean): (pos: number) => number | null {
	const state = EditorState.create({ doc, extensions: [typst ? typstLanguage() : latex(false)] });
	const tree = ensureSyntaxTree(state, doc.length, 25_000)!;
	return (pos) => pictureStartAt(state, pos, typst, tree);
}

describe('the picture around the caret', () => {
	it('finds a tikzpicture from inside and at its ends, the outer one when they nest', () => {
		const inner = '\\begin{tikzpicture}\\draw (0,0);\\end{tikzpicture}';
		const doc = `Before.\n\\begin{tikzpicture}\n\\node {${inner}};\n\\end{tikzpicture}\nAfter.`;
		const start = startsIn(doc, false);
		const from = doc.indexOf('\\begin{tikzpicture}');
		expect(start(doc.indexOf('\\draw'))).toBe(from);
		expect(start(from)).toBe(from);
		expect(start(doc.lastIndexOf('\\end{tikzpicture}') + 17)).toBe(from);
		expect(start(2)).toBeNull();
		expect(start(doc.indexOf('After'))).toBeNull();
	});

	it('passes over a picture in a comment and an environment that is no picture', () => {
		const doc = '% \\begin{tikzpicture}\n\\begin{figure}\nWords.\n\\end{figure}';
		const start = startsIn(doc, false);
		expect(start(5)).toBeNull();
		expect(start(doc.indexOf('Words'))).toBeNull();
	});

	it('finds a canvas call in Typst, by any import name, and not one in a string or a comment', () => {
		const doc =
			'#import "@preview/cetz:0.4.2" as c\n#c.canvas({\n  c.draw.line((0, 0), (1, 1))\n})\n#let s = "c.canvas()"\n// #c.canvas()\nEnd.';
		const start = startsIn(doc, true);
		expect(start(doc.indexOf('line'))).toBe(doc.indexOf('c.canvas'));
		expect(start(doc.indexOf('"c.canvas') + 3)).toBeNull();
		expect(start(doc.indexOf('// #c') + 6)).toBeNull();
		expect(start(doc.indexOf('End'))).toBeNull();
	});
});
