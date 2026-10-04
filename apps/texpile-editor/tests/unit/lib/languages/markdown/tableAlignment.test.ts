import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection, type Command } from 'prosemirror-state';
import { addColumnAfter, addColumnBefore, deleteColumn, tableEditing } from 'prosemirror-tables';
import { undo, history } from 'prosemirror-history';
import { tableAlignment } from '$lib/languages/markdown/visual/tableAlignment';
import { parseMarkdownFile, serializeMarkdownFile } from '$lib/languages/markdown/visual/roundtrip';

const MD = '| Name | Price |\n| :--- | ---: |\n| a | 1 |\n';

function inColumn(text: string, command: Command, after?: Command): string {
	const parsed = parseMarkdownFile(MD);
	let state = EditorState.create({ doc: parsed.doc, plugins: [history(), tableEditing(), tableAlignment] });
	let at = -1;
	state.doc.descendants((node, pos) => {
		if (at < 0 && node.isText && node.text === text) at = pos;
		return at < 0;
	});
	state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, at)));
	command(state, (tr) => (state = state.apply(tr)));
	after?.(state, (tr) => (state = state.apply(tr)));
	return serializeMarkdownFile(parsed, state.doc).split('\n')[1];
}

describe('a markdown table keeps each column its alignment', () => {
	it('when a column is put in before or after it', () => {
		expect(inColumn('Name', addColumnBefore)).toBe('| --- | :--- | ---: |');
		expect(inColumn('Name', addColumnAfter)).toBe('| :--- | --- | ---: |');
	});

	it('when the column before it is taken out, and back on undo', () => {
		expect(inColumn('Name', deleteColumn)).toBe('| ---: |');
		expect(inColumn('Name', deleteColumn, undo)).toBe('| :--- | ---: |');
	});
});
