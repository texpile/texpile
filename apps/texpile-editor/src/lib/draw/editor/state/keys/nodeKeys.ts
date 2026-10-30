import type { FigureStatement, NodeShape, NodeSide } from '../../figure/figureLanguage';
import type { FigureEditorState } from '../editorState.svelte';

const ARROW_SIDES: Record<string, NodeSide> = { ArrowUp: 'north', ArrowDown: 'south', ArrowLeft: 'west', ArrowRight: 'east' };
// what Tab steps a node's outline through, as Excalidraw's Tab cycles its three shapes
const SHAPE_CYCLE: NodeShape[] = ['rectangle', 'diamond', 'ellipse'];

function middleOf(ed: FigureEditorState, i: number) {
	const b = ed.snapBoxes.find((s) => s.stmt === i);
	return b ? [(b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2] : null;
}

/** the nodes an arrow joins to this one */
function linkedNodes(ed: FigureEditorState, st: FigureStatement) {
	const statements = ed.picture?.statements ?? [];
	const name = ed.language.nameOf(ed.source, st);
	if (!name) return [];
	const named = new Map(statements.flatMap((s) => (s.kind === 'node' ? [[ed.language.nameOf(ed.source, s), s.i] as const] : [])));
	return statements.flatMap((s) => {
		const ends = ed.language.readConnector(ed.source, s)?.ends.map((e) => e.node);
		if (!ends) return [];
		const other = ends[0] === name ? ends[1] : ends[1] === name ? ends[0] : null;
		const i = other ? named.get(other) : undefined;
		return i ? [i] : [];
	});
}

/** Alt and an arrow key: the nearest node an arrow joins to this one, on that side */
function walkToLinkedNode(ed: FigureEditorState, st: FigureStatement, side: NodeSide) {
	const from = middleOf(ed, st.i);
	if (!from) return;
	const ahead = linkedNodes(ed, st).flatMap((i) => {
		const to = middleOf(ed, i);
		if (!to) return [];
		const [dx, dy] = [to[0] - from[0], to[1] - from[1]];
		const along = side === 'east' ? dx : side === 'west' ? -dx : side === 'north' ? dy : -dy;
		const across = side === 'east' || side === 'west' ? Math.abs(dy) : Math.abs(dx);
		return along > 0 && along >= across ? [{ i, distance: Math.hypot(dx, dy) }] : [];
	});
	const next = ahead.sort((a, b) => a.distance - b.distance)[0];
	if (next) ed.select(next.i);
}

function cycleShape(ed: FigureEditorState, st: FigureStatement, back: boolean) {
	const now = ed.language.readNodeBox(ed.source, st)?.shape;
	const k = now ? SHAPE_CYCLE.indexOf(now) : -1;
	const shape = SHAPE_CYCLE[(k + (back ? SHAPE_CYCLE.length - 1 : 1)) % SHAPE_CYCLE.length];
	ed.applyIfChanged(ed.language.writeNodeBox(ed.source, st, { shape }));
}

/** a selected node's keys, as Excalidraw's: Enter types its text, Ctrl and an arrow add the next step on that side,
 *  Alt and an arrow walk to a node joined to it, Tab changes its outline */
export function handleNodeKey(e: KeyboardEvent, ed: FigureEditorState) {
	const st = ed.selectedStatement;
	if (st?.kind !== 'node' || ed.selection.length !== 1 || ed.picture?.layout) return false;
	const mod = e.ctrlKey || e.metaKey;
	const side = ARROW_SIDES[e.key];
	if (side && mod && !e.altKey && !e.shiftKey && !ed.flags.lockedAll.has(st.i)) ed.addStep(st.i, side, false);
	else if (side && e.altKey && !mod) walkToLinkedNode(ed, st, side);
	else if (e.key === 'Enter' && !mod && !e.altKey && !e.shiftKey && ed.selectedInfo?.text) ed.editText();
	else if (e.key === 'Tab' && !mod && !e.altKey && !ed.flags.lockedAll.has(st.i)) cycleShape(ed, st, e.shiftKey);
	else return false;
	return true;
}
