import { describe, expect, it } from 'vitest';
import { Transform } from 'prosemirror-transform';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { parseLatexFile, serializeLatexFile } from '$lib/workspace/latexRoundtrip';
import { endOf, parseDeck } from '../slideDeck';

const FRAME =
	'\\documentclass{beamer}\n\\title{A Small Deck}\n\\begin{document}\n\n\\begin{frame}{First Frame}\nSome words. \\pause More after pause.\n\\end{frame}\n\n\\end{document}\n';

describe('a second paragraph added inside a container', () => {
	it('is parted from the first by a blank line, with no \\par', async () => {
		const deck = await parseDeck(FRAME);
		const tr = new Transform(deck.parsed.doc);
		const at = endOf(deck.parsed.doc, 'More after pause.');
		tr.split(at, 1);
		tr.insert(at + 2, schema.text('More.'));
		expect(serializeLatexFile(deck.parsed, tr.doc)).toBe(FRAME.replace('pause.\n', 'pause.\n\nMore.\n'));
	});
});

describe('a display added in the visual editor', () => {
	it('sits inside its paragraph, so the text after it continues', () => {
		const file = '\\documentclass{article}\n\\begin{document}\nThe threshold is where it encodes.\n\nNext.\n\\end{document}\n';
		const parsed = parseLatexFile(file);
		const at = endOf(parsed.doc, 'The threshold is');
		const tr = new Transform(parsed.doc).replaceRangeWith(at, at, schema.nodes.block_math.create({}, schema.text('x')));
		expect(serializeLatexFile(parsed, tr.doc)).toBe(file.replace('is where', 'is\n\\[\nx\n\\]\nwhere'));
	});
});

describe('a display set to start a new paragraph after it', () => {
	it('writes a blank line after its own bytes, which stay as the file had them', () => {
		const file = '\\documentclass{article}\n\\begin{document}\nThe threshold is\n$$x$$\nwhere it is.\n\\end{document}\n';
		const parsed = parseLatexFile(file);
		const tr = new Transform(parsed.doc).setNodeAttribute(parsed.doc.child(0).nodeSize, 'continuesAfter', false);
		expect(serializeLatexFile(parsed, tr.doc)).toBe(file.replace('$$\nwhere', () => '$$\n\nwhere'));
	});
});
