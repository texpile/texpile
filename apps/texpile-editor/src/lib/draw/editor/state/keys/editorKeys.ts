import { addBranch } from '../../trees/treeCommands';
import { handleNodeKey } from './nodeKeys';
import type { CanvasGesture } from '../gesture/canvasGesture.svelte';
import type { FigureEditorState } from '../editorState.svelte';
import { ALL_TOOLS, VIEW_TOOLS, isOffered } from '../../tools/tools';
import { isWidgetKey, typing } from './keyTargets';
import { SNAP_STEP } from '../snapTargets';
import { deleteSelection, nudgeSelection } from '../selection/selectionCommands';
import { FIGURE_EDIT_COMMANDS, FIGURE_VIEW_COMMANDS, runFigureCommandKey } from './figureCommandKeys';

const TOOL_KEYS = new Map(ALL_TOOLS.flatMap((t) => [[t.key.toLowerCase(), t] as const, ...(t.digit ? [[t.digit, t] as const] : [])]));

const NUDGE: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };

/* eslint-disable no-param-reassign -- a key picks the editor's tool and holds the gesture's space */
export function handleEditorKey(e: KeyboardEvent, editor: FigureEditorState, gesture: CanvasGesture) {
	if (e.defaultPrevented) return false;
	if (runFigureCommandKey(e, FIGURE_VIEW_COMMANDS, editor)) return true;
	if (typing(e.target) || isWidgetKey(e)) return false;
	if (runFigureCommandKey(e, FIGURE_EDIT_COMMANDS, editor)) return true;
	const mod = e.ctrlKey || e.metaKey;
	if (handleNodeKey(e, editor)) return true;
	if (mod || e.altKey) return false;
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
