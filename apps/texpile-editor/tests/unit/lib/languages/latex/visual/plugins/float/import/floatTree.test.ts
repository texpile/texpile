import { describe, expect, it } from 'vitest';
import { Transform } from 'prosemirror-transform';
import { parseLatexFile, serializeLatexFile } from '$lib/workspace/latexRoundtrip';
import { withoutOrigins } from '$lib/editor/visual/parseOrigins';

const FILE = [
	'\\documentclass{article}',
	'\\usepackage{algorithm,algorithmic}',
	'\\begin{document}',
	'\\begin{algorithm}',
	'\\begin{algorithmic}[1]',
	'\\STATE{Initialize}',
	'\\end{algorithmic}',
	'\\caption{The linear setup\\label{alg:linear}}',
	'\\end{algorithm}',
	'\\end{document}',
	''
].join('\n');

describe('otherFloatBlocks', () => {
	it('reads the caption of an algorithm float as its caption block, and writes an edit to it back', () => {
		const parsed = parseLatexFile(FILE);
		const float = parsed.doc.child(0);
		const caption = float.lastChild!;
		expect([float.type.name, caption.type.name, caption.attrs.float]).toEqual(['environment', 'float_caption', 'algorithm']);
		expect(serializeLatexFile(parsed, parsed.doc)).toBe(FILE);
		let at = -1;
		parsed.doc.descendants((n, pos) => void (at < 0 && n.isText && n.text === 'The linear setup' && (at = pos)));
		const edited = new Transform(parsed.doc).replaceWith(at, at + 10, parsed.doc.type.schema.text('Tree')).doc;
		const want = FILE.replace('The linear setup', 'Tree setup');
		expect(serializeLatexFile(parsed, edited)).toBe(want);
		expect(serializeLatexFile(parsed, withoutOrigins(edited))).toBe(want);
	});
});
