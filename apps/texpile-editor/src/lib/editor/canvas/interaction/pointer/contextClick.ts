// the right button (G5, A4): inside the selection it keeps it, on an atom it selects the atom, on text the platform rule
import { NodeSelection, type EditorState, type Selection } from 'prosemirror-state';
import { PLATFORM_RULES, type Platform } from '$lib/editor/keys/platformKeys';
import type { CanvasHit } from '../../contracts/geometryTypes';
import type { VisualView } from '../../contracts/viewTypes';
import { pressedNode } from './clickRules';

export type ContextClickPlan = { kind: 'keep' } | { kind: 'node'; pos: number } | { kind: 'caret' } | { kind: 'word' };

/** the selection a right press made on an atom: a formula session or chip panel that would start from it waits */
const nodeSelected = new WeakMap<VisualView, Selection>();

/** the node a right press selects: a formula, an island chip or a leaf that is selectable */
function atomUnder(state: EditorState, hit: CanvasHit): number | null {
	const pressed = pressedNode(state.doc, hit);
	if (pressed < 0) return null;
	const node = state.doc.nodeAt(pressed);
	if (!node || node.isText || node.type.spec.selectable === false) return null;
	const target = hit.target.kind === 'cell' ? hit.target.inner : hit.target;
	const drawn =
		node.isAtom ||
		target.kind === 'formula' ||
		(target.kind === 'island' && node.isInline) ||
		(target.kind === 'leaf' && target.policy !== 'text' && target.policy !== 'island');
	return drawn ? pressed : null;
}

function insideSelection(selection: Selection, hit: CanvasHit, atom: number | null, state: EditorState): boolean {
	if (selection instanceof NodeSelection) return hit.inside >= selection.from && hit.inside < selection.to;
	if (!selection.empty) return hit.caret.pos >= selection.from && hit.caret.pos <= selection.to;
	// a caret inside the chip being pressed (an island's own text)
	const node = atom === null ? null : state.doc.nodeAt(atom);
	return !!node && !node.isAtom && selection.from > atom! && selection.to < atom! + node.nodeSize;
}

export function contextClickPlan(state: EditorState, hit: CanvasHit, platform: Platform): ContextClickPlan {
	const atom = atomUnder(state, hit);
	if (insideSelection(state.selection, hit, atom, state)) return { kind: 'keep' };
	if (atom !== null) return { kind: 'node', pos: atom };
	return { kind: PLATFORM_RULES[platform].contextClickSelectsWord ? 'word' : 'caret' };
}

export function markContextSelection(view: VisualView, selection: Selection): void {
	nodeSelected.set(view, selection);
}

/** the selection is still the one a right press made on an atom */
export function isContextSelection(view: VisualView): boolean {
	return nodeSelected.get(view)?.eq(view.state.selection) ?? false;
}
