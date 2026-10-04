// A caption edit used to collapse the whole float onto one line, because the slot template was
// reprinted from the tree instead of sliced from the source.
import { describe, it, expect } from 'vitest';
import * as LatexParser from '$lib/languages/latex/parser/latexParser';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';
import type { Node } from 'prosemirror-model';

const FLOAT = [
	'\\begin{figure}[h]',
	'\\centering',
	'\\includegraphics[width=0.75\\textwidth]{a.png}',
	'\\caption{Old caption}',
	'\\label{fig:a}',
	'\\end{figure}'
].join('\n');

/** retype the caption, the edit that forces the float to regenerate */
function editCaption(doc: Node): Node {
	const tr: Node[] = [];
	doc.forEach((n) => {
		if (n.type.name !== 'image') return void tr.push(n);
		tr.push(n.type.create(n.attrs, n.type.schema.text('New caption')));
	});
	return doc.type.create(doc.attrs, tr);
}

describe('figure float formatting', () => {
	it('keeps its line breaks when the caption changes', () => {
		const { doc } = LatexParser.latexToProseMirror(FLOAT);
		const out = serializeToLatex(editCaption(doc));
		expect(out).toContain('New caption');
		expect(out).toContain('\\begin{figure}[h]\n\\centering');
		expect(out).not.toMatch(/\\begin\{figure\}\[h\]\\centering/);
	});

	it('still substitutes the image and the label', () => {
		const { doc } = LatexParser.latexToProseMirror(FLOAT);
		const out = serializeToLatex(editCaption(doc));
		expect(out).toContain('{a.png}');
		expect(out).toContain('\\label{fig:a}');
		expect(out).not.toContain('TexpileFig');
	});
});

describe('a caption typed into a figure that had none', () => {
	// it went in through a string replace, which read `$1` in it as a back reference
	it('keeps a dollar amount as typed', () => {
		const { doc } = LatexParser.latexToProseMirror('\\begin{figure}[h]\n\\centering\n\\includegraphics{a.png}\n\\end{figure}');
		const kids: Node[] = [];
		doc.forEach((n) => kids.push(n.type.name === 'image' ? n.type.create(n.attrs, n.type.schema.text('Costs $1 each')) : n));
		expect(serializeToLatex(doc.type.create(doc.attrs, kids))).toContain('\\caption{Costs \\$1 each}');
	});
});
