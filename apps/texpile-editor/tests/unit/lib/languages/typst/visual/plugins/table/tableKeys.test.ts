// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState, Selection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { typstToProseMirror } from '$lib/languages/typst/visual/convert/converter';
import { tableKeys } from '$lib/languages/typst/visual/plugins/table/tableKeys';

function backspaceHandled(src: string, text: string): boolean {
	const { doc } = typstToProseMirror(src);
	let at = -1;
	doc.descendants((n, pos) => {
		if (at < 0 && n.isText && n.text!.includes(text)) at = pos;
	});
	const state = EditorState.create({ doc, selection: Selection.near(doc.resolve(at)) });
	const plugin = tableKeys()[0];
	const view = { state, dispatch: () => {} } as unknown as EditorView;
	return !!plugin.props.handleKeyDown!.call(plugin, view, new KeyboardEvent('keydown', { key: 'Backspace' }));
}

describe('table keys', () => {
	it('keeps Backspace at the start of a box under a table in the box', () => {
		const src =
			'#let note(body) = block(stroke: 0.5pt, inset: 8pt, body)\n\n#table(\n  columns: 2,\n  [Name], [Val],\n)\n\n#note[Note body text.]\n';
		expect(backspaceHandled(src, 'Note body')).toBe(true);
		expect(backspaceHandled('Plain words.', 'Plain')).toBe(false);
	});
});
