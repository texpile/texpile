import { describe, expect, it } from 'vitest';
import { parseLatexFile, serializeLatexFile } from '$lib/workspace/latexRoundtrip';
import { withoutOrigins } from '$lib/editor/visual/parseOrigins';

function fileOf(body: string[]): string {
	return ['\\documentclass{article}', '\\begin{document}', ...body, '\\end{document}', ''].join('\n');
}

describe('figureBlocks', () => {
	it('opens a figure of text as a float of its own, its caption its caption block', () => {
		const file = fileOf([
			'\\begin{figure}[htb]',
			'\\centering',
			'\\begin{enumerate}',
			'\\item Initialization',
			'\\end{enumerate}',
			'\\caption{The algorithm.}',
			'\\end{figure}'
		]);
		const parsed = parseLatexFile(file);
		const figure = parsed.doc.child(0);
		expect([figure.type.name, figure.attrs.args, figure.child(1).type.name, figure.lastChild!.attrs.float]).toEqual([
			'environment',
			'[htb]',
			'list',
			'figure'
		]);
		expect(serializeLatexFile(parsed, parsed.doc)).toBe(file);
		// written afresh, its blocks part on blank lines
		expect(serializeLatexFile(parsed, withoutOrigins(parsed.doc)).replace(/\n\n/g, '\n')).toBe(file);
	});

	it('keeps a figure holding a picture as written', () => {
		const parsed = parseLatexFile(
			fileOf(['\\begin{figure}', '\\begin{tikzpicture}', '\\draw (0,0) -- (1,1);', '\\end{tikzpicture}', '\\end{figure}'])
		);
		expect(parsed.doc.child(0).type.name).toBe('raw_latex');
	});
});
