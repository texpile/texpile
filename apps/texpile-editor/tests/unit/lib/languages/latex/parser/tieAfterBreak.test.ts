import { describe, expect, it } from 'vitest';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { Transform } from 'prosemirror-transform';
import { serializeLatexFile } from '$lib/workspace/latexRoundtrip';
import { withoutOrigins } from '$lib/editor/visual/parseOrigins';
import { endOf, parseDeck } from '../slideDeck';

const TEXT = '\\documentclass{article}\n\\begin{document}\n\nWords.\\\\~\n\nOther.\n\n\\end{document}\n';

describe('a tie after the last line break of a paragraph', () => {
	it('is read and written afresh', async () => {
		const deck = await parseDeck(TEXT);
		expect(deck.parsed.doc.firstChild!.lastChild!.text).toBe('\u00a0');
		expect(serializeLatexFile(deck.parsed, withoutOrigins(deck.parsed.doc))).toContain('Words.\\\\\n~');
	});

	it('survives an edit in the same paragraph', async () => {
		const deck = await parseDeck(TEXT);
		const tr = new Transform(deck.parsed.doc);
		tr.insert(endOf(deck.parsed.doc, 'Words'), schema.text('!'));
		expect(serializeLatexFile(deck.parsed, tr.doc)).toContain('Words!.\\\\');
		expect(serializeLatexFile(deck.parsed, tr.doc)).toContain('~');
	});
});
