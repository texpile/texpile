import { describe, expect, it } from 'vitest';
import type { Node } from 'prosemirror-model';
import { Transform } from 'prosemirror-transform';
import { parseLatexFile, serializeLatexFile } from '$lib/workspace/latexRoundtrip';
import { withoutOrigins } from '$lib/editor/visual/parseOrigins';

const FLOAT = [
	'\\begin{figure}[t]',
	'\\centering',
	'\\begin{subfigure}[b]{0.45\\textwidth}',
	'\\includegraphics[width=\\textwidth]{a.png}',
	'\\caption{Left}',
	'\\label{fig:a}',
	'\\end{subfigure}',
	'\\hfill',
	'\\subfloat[Right]{\\includegraphics[width=0.45\\textwidth]{b.png}}',
	'\\caption{Both.}',
	'\\label{fig:both}',
	'\\end{figure}'
].join('\n');

function fileOf(body: string): string {
	return `\\documentclass{article}\n\\usepackage{subcaption}\n\\begin{document}\n${body}\n\\end{document}\n`;
}

function retyped(doc: Node, from: string, to: string): Node {
	let at = -1;
	doc.descendants((n, pos) => {
		if (at < 0 && n.isText && n.text === from) at = pos;
	});
	return new Transform(doc).replaceWith(at, at + from.length, doc.type.schema.text(to)).doc;
}

describe('figureGroupBlocks', () => {
	it('reads a float of several images as one figure, each image with its own caption', () => {
		const group = parseLatexFile(fileOf(FLOAT)).doc.child(0);
		expect(group.type.name).toBe('figure_group');
		expect(group.attrs.label).toBe('fig:both');
		const images: Node[] = [];
		group.forEach((c) => void (c.type.name === 'image' && images.push(c)));
		expect(images.map((i) => [i.attrs.src, i.textContent, i.attrs.label])).toEqual([
			['a.png', 'Left', 'fig:a'],
			['b.png', 'Right', null]
		]);
		expect(group.lastChild!.textContent).toBe('Both.');
	});

	it('writes edited captions back into the float as written', () => {
		const file = fileOf(FLOAT);
		const parsed = parseLatexFile(file);
		expect(serializeLatexFile(parsed, parsed.doc)).toBe(file);
		const edited = retyped(retyped(parsed.doc, 'Right', 'Other'), 'Both.', 'All.');
		const want = file.replace('\\subfloat[Right]', '\\subfloat[Other]').replace('\\caption{Both.}', '\\caption{All.}');
		expect(serializeLatexFile(parsed, edited)).toBe(want);
		expect(serializeLatexFile(parsed, withoutOrigins(edited))).toBe(want);
	});

	it('leaves a float whose minipages each number a figure of their own as written', () => {
		const body = [
			'\\begin{figure}',
			'\\begin{minipage}{0.4\\textwidth}\\includegraphics{a}\\caption{One}\\end{minipage}',
			'\\begin{minipage}{0.4\\textwidth}\\includegraphics{b}\\caption{Two}\\end{minipage}',
			'\\end{figure}'
		].join('\n');
		expect(parseLatexFile(fileOf(body)).doc.child(0).type.name).toBe('raw_latex');
	});

	it('leaves no empty panel where an image was deleted', () => {
		const file = fileOf(FLOAT);
		const parsed = parseLatexFile(file);
		const first = parsed.doc.child(0).child(0);
		const edited = new Transform(parsed.doc).delete(1, 1 + first.nodeSize).doc;
		for (const doc of [edited, withoutOrigins(edited)]) {
			const out = serializeLatexFile(parsed, doc);
			expect(out.match(/\\begin\{subfigure\}|\\subfloat/g)).toHaveLength(1);
			expect(out.match(/\\includegraphics/g)).toHaveLength(1);
			expect(out).toContain('b.png');
			expect(out).not.toContain('\\caption{}');
		}
	});
});
