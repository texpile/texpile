import type { Arranged, ArrangeTarget } from '../figure/figureLanguage';
import type { FigureEditorState } from '../state/editorState.svelte';
import { chosen } from '../state/selection/selectionCommands';
import { subtree } from './statementTree';

type Editor = FigureEditorState;
export type OrderMove = 'back' | 'backward' | 'forward' | 'front';

const ORDER_KEYS: Record<string, [OrderMove, OrderMove]> = { BracketLeft: ['backward', 'back'], BracketRight: ['forward', 'front'] };

/** the selected statements when they share a parent, with the parent's other statements in written order */
function siblings(ed: Editor) {
	const ids = chosen(ed).map((s) => s.i);
	if (!ids.length) return null;
	const parent = ed.tree.parent.get(ids[0]) ?? 0;
	if (ids.some((i) => (ed.tree.parent.get(i) ?? 0) !== parent)) return null;
	const order = (ed.tree.children.get(parent) ?? []).filter((c) => ed.tree.byId.get(c)?.kind !== 'frame');
	return { ids, order };
}

/** the edit, with what it placed selected, unless it takes from a statement what it uses */
function place(ed: Editor, out: Arranged | null, refusal: string) {
	if (!out || out.source === ed.source) return;
	const broken = ed.language.brokenNeed(ed.source, out.source, ed.shownIndex);
	if (broken) {
		ed.check.decline(`${refusal}: ${broken}.`);
		return;
	}
	const picture = ed.language.readPicture(out.source, ed.shownIndex);
	ed.applyEdit(
		out.source,
		out.at.flatMap((at) => picture?.statements.find((s) => s.from === at)?.i ?? [])
	);
}

/** where an order command puts the selection; null when it is already there */
function orderTarget(ed: Editor, move: OrderMove): ArrangeTarget | null {
	const s = siblings(ed);
	if (!s) return null;
	const { ids, order } = s;
	const rest = order.filter((c) => !ids.includes(c));
	const first = order.findIndex((c) => ids.includes(c));
	const last = Math.max(...order.map((c, k) => (ids.includes(c) ? k : -1)));
	if (!rest.length) return null;
	switch (move) {
		case 'back':
			return order.slice(0, ids.length).every((c) => ids.includes(c)) ? null : { before: rest[0] };
		case 'front':
			return order.slice(-ids.length).every((c) => ids.includes(c)) ? null : { after: rest.at(-1)! };
		case 'backward':
			return first > 0 ? { before: order[first - 1] } : null;
		case 'forward':
			return last < order.length - 1 ? { after: order[last + 1] } : null;
	}
}

export function canOrder(ed: Editor, move: OrderMove) {
	return orderTarget(ed, move) !== null;
}

/** earlier in the text is further back: TikZ draws in the order it reads */
export function orderSelection(ed: Editor, move: OrderMove) {
	const to = orderTarget(ed, move);
	if (to && ed.picture) place(ed, ed.language.moveStatements(ed.source, ed.picture, siblings(ed)!.ids, to), 'Not moved');
}

export function canGroup(ed: Editor) {
	return siblings(ed) !== null;
}

export function groupSelection(ed: Editor) {
	const s = siblings(ed);
	if (s && ed.picture) place(ed, ed.language.groupStatements(ed.source, ed.picture, s.ids), 'Not grouped');
}

/** why the selected scope cannot be ungrouped, or null when it can; undefined when nothing to ungroup is selected */
export function ungroupBlocker(ed: Editor) {
	const st = ed.selectedStatement;
	if (st?.kind !== 'scope' || !ed.picture) return undefined;
	return ed.language.ungroupStatement(ed.source, ed.picture, st.i) ? null : 'Its options apply to everything in it';
}

export function ungroupSelection(ed: Editor) {
	const st = ed.selectedStatement;
	if (st?.kind === 'scope' && ed.picture) place(ed, ed.language.ungroupStatement(ed.source, ed.picture, st.i), 'Not ungrouped');
}

/** the rows a drag carries: the selection when the dragged row is in it */
export function draggedIds(ed: Editor, i: number) {
	return ed.selection.includes(i) ? chosen(ed).map((s) => s.i) : [i];
}

/** a drop is refused onto the dragged rows themselves or anywhere inside them */
export function canDrop(ed: Editor, ids: number[], target: number) {
	return !ids.some((i) => subtree(ed.tree, i).includes(target));
}

export function dropStatements(ed: Editor, ids: number[], to: ArrangeTarget) {
	if (ed.picture) place(ed, ed.language.moveStatements(ed.source, ed.picture, ids, to), 'Not moved');
}

export function renameStatement(ed: Editor, i: number, label: string) {
	const st = ed.tree.byId.get(i);
	if (!st) return;
	ed.applyIfChanged(ed.language.writeLabel(ed.source, st, label));
}

/** Ctrl+G and Ctrl+[ ], with Shift for their stronger forms; true when the key was one of them */
export function handleArrangeKey(e: KeyboardEvent, ed: Editor) {
	if (!(e.ctrlKey || e.metaKey) || e.altKey) return false;
	const order = ORDER_KEYS[e.code];
	if (order) {
		orderSelection(ed, order[e.shiftKey ? 1 : 0]);
		return true;
	}
	if (e.code !== 'KeyG') return false;
	if (e.shiftKey) ungroupSelection(ed);
	else groupSelection(ed);
	return true;
}
