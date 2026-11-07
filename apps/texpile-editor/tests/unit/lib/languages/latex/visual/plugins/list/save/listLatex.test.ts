import { describe, expect, it } from 'vitest';
import { Transform } from 'prosemirror-transform';
import { EditorState, TextSelection } from 'prosemirror-state';
import { createDedentListCommand } from 'prosemirror-flat-list';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { serializeLatexFile } from '$lib/workspace/latexRoundtrip';
import { indentListItem } from '$lib/editor/visual/extensions/listIndent/listIndent';
import { endOf, parseDeck } from '../../../../slideDeck';

const wrap = (body: string) => `\\documentclass{article}\n\\begin{document}\n\nIntro.\n\n${body}\n\nOutro.\n\n\\end{document}\n`;
const NESTED_FIRST = wrap(
	'\\begin{itemize}\n\\item Apple\n\\begin{itemize}\n\\item Nested one\n\\item Nested two\n\\end{itemize}\n\\item Banana\n\\end{itemize}'
);

async function afterCommand(
	text: string,
	at: string,
	run: (state: EditorState, dispatch: (tr: Transform) => void) => void
): Promise<string> {
	const deck = await parseDeck(text);
	let state = EditorState.create({ doc: deck.parsed.doc, selection: TextSelection.create(deck.parsed.doc, endOf(deck.parsed.doc, at)) });
	run(state, (tr) => (state = state.apply(tr as never)));
	return serializeLatexFile(deck.parsed, state.doc);
}

describe('a list written back after an edit', () => {
	it('Enter at the end of an item after a nested list adds the new item line only', async () => {
		const deck = await parseDeck(NESTED_FIRST);
		const tr = new Transform(deck.parsed.doc);
		const at = endOf(deck.parsed.doc, 'Banana');
		tr.split(at, 2);
		tr.insert(at + 4, schema.text('Cherry'));
		expect(serializeLatexFile(deck.parsed, tr.doc)).toBe(NESTED_FIRST.replace('Banana\n', 'Banana\n\\item Cherry\n'));
	});

	it('Tab nests an item into the list before it without a blank line', async () => {
		const out = await afterCommand(NESTED_FIRST, 'Banana', (state, dispatch) => indentListItem()(state, dispatch as never));
		expect(out).toBe(
			NESTED_FIRST.replace('\\item Nested two\n\\end{itemize}\n\\item Banana\n', '\\item Nested two\n\\item Banana\n\\end{itemize}\n')
		);
	});

	it('Shift+Tab lifts an item out of a nested list without a blank line', async () => {
		const out = await afterCommand(NESTED_FIRST, 'Nested two', (state, dispatch) => createDedentListCommand()(state, dispatch as never));
		expect(out).toBe(NESTED_FIRST.replace('\\item Nested two\n\\end{itemize}\n', '\\end{itemize}\n\\item Nested two\n'));
	});
});
