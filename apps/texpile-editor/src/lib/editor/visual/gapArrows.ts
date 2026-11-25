// the gap cursor plugin drawn on the canvas; its arrows are the caret engine's
import { gapCursor, GapCursor } from 'prosemirror-gapcursor';
import type { EditorState, Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { gapsBesideLineParagraphs } from '$lib/editor/visual/lineParagraph';

function gapBar(): HTMLElement {
	return Object.assign(document.createElement('div'), { className: 'ProseMirror-gapcursor' });
}

function drawGapCursor(state: EditorState): DecorationSet | null {
	if (!(state.selection instanceof GapCursor)) return null;
	// the bar holds the browser's range (holdHiddenSelection). ProseMirror read it and wrote its own between the blocks
	// again, and WebKit moved that into the next editable block: Down from a formula went to a code block further on
	const spec = { key: 'gapcursor', ignoreSelection: true, canvas: { kind: 'caret' } };
	return DecorationSet.create(state.doc, [Decoration.widget(state.selection.head, gapBar, spec)]);
}

export function heldGapCursor(): Plugin {
	gapsBesideLineParagraphs();
	const plugin = gapCursor();
	plugin.props.decorations = drawGapCursor;
	// the caret engine (caretArrowsPlugin) decides every arrow that meets a gap
	delete plugin.props.handleKeyDown;
	return plugin;
}
