import { handleArrangeKey } from '../../objects/arrangeCommands';
import { addBranch } from '../../trees/treeCommands';
import { toggleLocked } from '../../objects/lockCommands';
import { handleNodeKey } from './nodeKeys';
import type { CanvasGesture } from '../gesture/canvasGesture.svelte';
import type { FigureEditorState } from '../editorState.svelte';
import { ALL_TOOLS, VIEW_TOOLS, isOffered } from '../../tools/tools';
import { isWidgetKey, typing } from './keyTargets';
import { copyStyle, pasteStyle } from '../selection/selectionStyle';
import { SNAP_STEP } from '../snapTargets';
import { deleteSelection, duplicateSelection, nudgeSelection } from '../selection/selectionCommands';

const TOOL_KEYS = new Map(ALL_TOOLS.flatMap((t) => [[t.key.toLowerCase(), t] as const, ...(t.digit ? [[t.digit, t] as const] : [])]));

const NUDGE: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };

/** the view's keys, which the page's own zoom would take otherwise, so they work while typing too */
function handleZoomKey(e: KeyboardEvent, editor: FigureEditorState) {
	if (!(e.ctrlKey || e.metaKey) || e.altKey) return false;
	if (e.key === '=' || e.key === '+') editor.viewport.zoomIn();
	else if (e.key === '-' || e.key === '_') editor.viewport.zoomOut();
	else if (e.key === '0') editor.viewport.zoomToPercent(100);
	else return false;
	return true;
}

/** the editor's keys, wherever in it the focus is; true when the key was the editor's */
/* eslint-disable no-param-reassign -- a key picks the editor's tool and holds the gesture's space */
export function handleEditorKey(e: KeyboardEvent, editor: FigureEditorState, gesture: CanvasGesture) {
	if (e.defaultPrevented) return false;
	if (handleZoomKey(e, editor)) return true;
	if (typing(e.target) || isWidgetKey(e)) return false;
	const mod = e.ctrlKey || e.metaKey;
	if (mod && e.key.toLowerCase() === 'z') {
		if (e.shiftKey) editor.redo();
		else editor.undo();
		return true;
	}
	if (mod && e.key.toLowerCase() === 'd') {
		duplicateSelection(editor);
		return true;
	}
	if (mod && e.shiftKey && e.key.toLowerCase() === 'l') {
		toggleLocked(editor, editor.selection);
		return true;
	}
	if (mod && e.key === "'") {
		e.preventDefault();
		editor.toggleGrid();
		return true;
	}
	if (mod && e.key.toLowerCase() === 'a') {
		editor.selectAll();
		return true;
	}
	if (handleArrangeKey(e, editor)) return true;
	if (handleNodeKey(e, editor)) return true;
	if (mod && e.key.toLowerCase() === 'y') {
		editor.redo();
		return true;
	}
	if (mod && e.altKey && (e.code === 'KeyC' || e.code === 'KeyV')) {
		if (e.code === 'KeyC') copyStyle(editor);
		else pasteStyle(editor);
		return true;
	}
	if (mod || e.altKey) return false;
	// Excalidraw's: Shift+1 fits everything, Shift+2 the selection
	if (e.shiftKey && (e.code === 'Digit1' || e.code === 'Digit2')) {
		if (e.code === 'Digit1') editor.fitView();
		else editor.fitSelection();
		return true;
	}
	if (e.key === '?') {
		editor.shortcutsShown = true;
		return true;
	}
	if (e.key.toLowerCase() === 'i' && !e.shiftKey && !editor.picture?.layout && editor.language.features.includes('library')) {
		editor.showLibrary(!editor.libraryShown);
		return true;
	}
	if (e.key === 'Escape' && editor.libraryShown) {
		editor.showLibrary(false);
		return true;
	}
	// Escape steps back: a drawing tool, then the selection; with neither it is not the canvas's (a modal closes)
	if (e.key === 'Escape' && gesture.finishClicks()) return true;
	if (e.key === 'Escape' && editor.dimension.clear()) return true;
	if (e.key === 'Escape') {
		if (editor.tool === 'select' && !editor.selection.length) return false;
		gesture.cancel();
		// inside a scope it steps out one level, to the scope, as Excalidraw's groups do
		const parents = new Set(editor.selection.map((i) => editor.tree.parent.get(i) ?? 0));
		const parent = editor.tool === 'select' && parents.size === 1 ? [...parents][0] : 0;
		editor.tool = 'select';
		editor.select(parent);
		return true;
	}
	if (e.key === 'Enter' && gesture.finishClicks()) return true;
	// a number typed while a shape is drawn click by click sizes it, as in a CAD sketch, and never picks another tool
	if (/^[\d.]$/.test(e.key) && (gesture.preview || gesture.typed.fields.length)) {
		if (gesture.typed.fields.length && !gesture.typed.open) {
			gesture.typed.start(e.key);
			gesture.followTyped();
		}
		return true;
	}
	// a tree grows as an outline does: Tab under the node, Enter beside it
	if ((e.key === 'Tab' || e.key === 'Enter') && !e.shiftKey && addBranch(editor, e.key === 'Tab' ? 'child' : 'sibling')) return true;
	if (e.key === 'Delete' || e.key === 'Backspace') {
		deleteSelection(editor);
		return true;
	}
	const nudge = NUDGE[e.key];
	if (nudge) {
		const step = e.shiftKey ? SNAP_STEP.grid : SNAP_STEP.fine;
		nudgeSelection(editor, nudge[0] * step, nudge[1] * step);
		return true;
	}
	if (e.key === ' ') {
		gesture.spaceDown = true;
		return true;
	}
	if (e.key.toLowerCase() === 'q' && !e.shiftKey) {
		editor.toolLocked = !editor.toolLocked;
		return true;
	}
	const tool = TOOL_KEYS.get(e.key.toLowerCase());
	if (tool && isOffered(tool, editor.language) && !e.shiftKey && (!editor.picture?.layout || VIEW_TOOLS.has(tool.id))) {
		editor.tool = tool.id;
		return true;
	}
	return false;
}
/* eslint-enable no-param-reassign */
