// @vitest-environment jsdom
// Linux PRIMARY on the canvas: a settled selection's text goes to the selection clipboard, and a middle press pastes it
import { afterEach, expect, it, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { primarySelectionPlugin } from '$lib/editor/visual/extensions/primarySelection';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { createTestCanvasView } from '../../canvas/testing/testCanvasView';

afterEach(() => {
	vi.useRealTimers();
	delete (window as { texpileNative?: unknown }).texpileNative;
});

it('writes the selection to PRIMARY once it settles, while the editor has the focus', () => {
	vi.useFakeTimers();
	const writeSelection = vi.fn();
	(window as { texpileNative?: unknown }).texpileNative = { clipboardWriteSelection: writeSelection };
	const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, schema.text('Alpha beta.'))]);
	const view = createTestCanvasView(EditorState.create({ doc, plugins: [primarySelectionPlugin()] }));
	view.focus();
	view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 3)));
	view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 6)));
	vi.runAllTimers();
	expect(writeSelection).toHaveBeenCalledTimes(1);
	expect(writeSelection).toHaveBeenCalledWith('Alpha');
});
