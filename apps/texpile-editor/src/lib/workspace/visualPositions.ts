// Remembering where the CARET was in the visual editor, per file.
//
// Only the caret. Not the viewport: both editors navigate by cursor, so placing the caret and
// scrolling to it already puts you where you were, and a viewport anchor pushed through the block
// map bought nothing extra - the map is block-granular - at the cost of the whole lifecycle needed
// to keep a scroll position fresh.
//
// And not a ProseMirror position either. Entering visual mode re-parses, so a pmPos captured
// against the old doc means nothing against the new one. What is stored is a place in the FILE, the
// same record SourceEditor writes, so leaving a file in one mode and coming back in the other lands
// in the same place with no second record to disagree with the first.
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { buildBlockMap, pmPosToSourceOffset, sourceOffsetToPmPos } from '$lib/editor/visual/sourceMap';
import { docPositions, offsetToRowCol, rowColToOffset } from './docPositions';
import { flashNodeAt } from '$lib/editor/visual/extensions/flash-plugin';

/**
 * Leaving the visual editor: map the PM caret back to a file position and store it. Must be called
 * while the view is still mounted - `bodyOffset` absolutizes the body-relative orig.start stamps.
 */
export function saveVisualPosition(v: EditorView, path: string, source: string, bodyOffset: number): void {
	const doc = v.state.doc;
	const offset = pmPosToSourceOffset(doc, buildBlockMap(doc, bodyOffset), v.state.selection.head);
	if (offset == null) return;
	const { row, column } = offsetToRowCol(source, offset);
	// firstVisibleLine is the caret's own line: source mode then opens with it near the top, which is
	// the only viewport answer available without having recorded a viewport
	docPositions.set(path, { row, column, firstVisibleLine: row + 1 });
}

/**
 * Entering the visual editor: put the caret back and scroll to it. One shot, at mount.
 *
 * Deliberately synchronous. A mode switch resolves its own (fresher) anchor in a double rAF, so it
 * lands after this one and wins - the precedence we want, without this needing to know the mode
 * switch exists.
 */
export function restoreVisualPosition(
	v: EditorView,
	path: string,
	source: string,
	bodyOffset: number,
	strip?: (s: string) => string
): void {
	const pos = docPositions.get(path);
	const jumped = docPositions.takeJump(path); // taken even when the restore below gives up
	if (!pos) return;
	const doc = v.state.doc;
	const target = sourceOffsetToPmPos(doc, buildBlockMap(doc, bodyOffset), rowColToOffset(source, pos.row, pos.column), strip);
	if (target == null) return; // resolved into the preamble, which the visual editor does not show

	// Never restore ONTO an embedded node. TextSelection.near hands back a NodeSelection when the
	// nearest valid selection is a leaf - a math field, an image - and selecting one of those makes
	// ProseMirror call the node view's selectNode(), which builds the embedded editor and focuses it.
	// Reopening a tab must park a caret, never drop the user inside a formula.
	const $target = doc.resolve(target);
	const forward = TextSelection.near($target, 1);
	const selection = forward instanceof TextSelection ? forward : TextSelection.near($target, -1);
	if (!(selection instanceof TextSelection)) return; // nowhere safe to land; leave the view alone

	try {
		v.dispatch(v.state.tr.setSelection(selection).scrollIntoView().setMeta('addToHistory', false));
		// Reclaim DOM focus for PM. The restored caret can land inside a CodeMirror-backed node view -
		// a raw-latex block, a code block - which focuses its own inner editor on mount; PM then never
		// syncs the DOM caret and its selection reads back as doc start. Documents made mostly of
		// those (a resume built from \resumeItem macros) hit it on nearly every restore, while a file
		// of ordinary paragraphs never does. Same reason resolveVisualAnchor calls this.
		v.focus();
		// a jump's landing gets the amber the SyncTeX and mode-switch flashes use: the reader sees
		// that the view moved, instead of wondering whether the click did anything
		if (jumped && selection.$head.depth > 0) flashNodeAt(v, selection.$head.before(1));
	} catch {
		/* the document moved under a stored position; leave the caret where it mounted */
	}
}
