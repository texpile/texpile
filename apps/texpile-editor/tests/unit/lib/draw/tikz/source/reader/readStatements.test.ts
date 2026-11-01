import { describe, expect, it } from 'vitest';
import { readBody } from '$lib/draw/tikz/source/reader/readStatements';

function shapes(source: string) {
	return readBody(source, 0, source.length).statements.map((s) => [source.slice(s.from, s.to), s.kind, s.command]);
}

describe('the reader', () => {
	it("ends a document's own macro at the next statement or line, and reads none as \\draw", () => {
		const src = '\\state{0}{0}{$x$}\n\\state{1}{0}{$y$}\n\\drawarea{1}{2};\n\\draw (0,0) -- (1,1);';
		expect(shapes(src)).toEqual([
			['\\state{0}{0}{$x$}', 'other', ''],
			['\\state{1}{0}{$y$}', 'other', ''],
			['\\drawarea{1}{2};', 'other', ''],
			['\\draw (0,0) -- (1,1);', 'path', '\\draw']
		]);
	});

	it('reads a layer as a group of the statements in it, so they move in and out of it whole', () => {
		const src = '\\begin{pgfonlayer}{bg}\n\\draw (0,0) -- (1,1);\n\\end{pgfonlayer}\n\\node {a};';
		const [layer, node] = readBody(src, 0, src.length).statements;
		expect([layer.kind, src.slice(layer.from, layer.to).endsWith('\\end{pgfonlayer}'), layer.body.map((s) => s.kind), node.kind]).toEqual([
			'scope',
			true,
			['path'],
			'node'
		]);
	});

	it('keeps a loop whole through the statements of its body', () => {
		const src =
			'\\foreach \\a in {1,2} {\n  \\pgfmathsetmacro{\\x}{\\a*2}\n  \\let\\op\\pgfmathresult\n  \\draw (\\x,0) circle (1);\n}\n\\node at (0,0) {a; b};';
		const [loop, node] = readBody(src, 0, src.length).statements;
		expect([loop.kind, loop.body.map((s) => s.kind), src.slice(loop.to - 1, loop.to)]).toEqual([
			'foreach',
			['other', 'other', 'path'],
			'}'
		]);
		expect([node.kind, src.slice(node.from, node.to)]).toEqual(['node', '\\node at (0,0) {a; b};']);
	});
});
