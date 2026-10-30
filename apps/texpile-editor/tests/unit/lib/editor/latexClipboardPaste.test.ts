// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Slice } from 'prosemirror-model';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { latexClipboardPlugin } from '$lib/editor/visual/extensions/latexClipboard';

// jsdom has no ClipboardEvent, which ProseMirror's paste makes for its handlers
globalThis.ClipboardEvent ??= class extends Event {
	clipboardData = null;
} as unknown as typeof ClipboardEvent;

it('keeps the paragraph breaks of text copied with Windows line ends', () => {
	const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('x')])]);
	const view = new EditorView(document.createElement('div'), {
		state: EditorState.create({ doc, plugins: [latexClipboardPlugin], selection: TextSelection.atEnd(doc) })
	});
	const text = 'First \\textbf{a}.\r\n\r\nSecond $x$.\r\n';
	const event = { clipboardData: { getData: (type: string) => (type === 'text/plain' ? text : '') } } as unknown as ClipboardEvent;
	expect(latexClipboardPlugin.props.handlePaste!.call(latexClipboardPlugin, view, event, Slice.empty)).toBe(true);
	const texts: string[] = [];
	view.state.doc.forEach((block) => texts.push(block.textContent));
	expect(texts).toContain('First a.');
	view.destroy();
});
