// Left and Right inside a textblock in the caret engine: a grapheme of text, a chip stepped over as one character, a
// formula selected (its math session takes the caret), a source chip entered, and no caret where a chip on a line of its
// own leaves no room for one
import { NodeSelection, TextSelection, type Selection } from 'prosemirror-state';
import type { Node as PMNode, ResolvedPos } from 'prosemirror-model';
import type { VisualView } from '../contracts/viewTypes';
import { caretPolicyOf } from '../geometry/caretPolicy';

/** the textblock's edge: the key goes on through the stream */
export const EDGE = 'edge';
export type InlineStep = Selection | typeof EDGE;

function onOwnLine(view: VisualView, node: PMNode | null | undefined): boolean {
	return !!node && !node.isText && caretPolicyOf(view, node) === 'ownLine';
}

/** a caret can stand at `$pos`: something besides a chip on a line of its own is beside it, or the textblock is empty */
export function standsAt(view: VisualView, $pos: ResolvedPos): boolean {
	const before = $pos.nodeBefore;
	const after = $pos.nodeAfter;
	if (!before && !after) return true;
	return (!!before && !onOwnLine(view, before)) || (!!after && !onOwnLine(view, after));
}

/** where `pos` lands for a plain key: a caret, the chip past it when no caret stands there, or the textblock's edge.
 *  `pastLine`: the key passed a chip on a line of its own, whose line a caret before the next chip would seem to stand on */
function land(view: VisualView, pos: number, dir: -1 | 1, pastLine = false): InlineStep {
	const { doc } = view.state;
	const $pos = doc.resolve(pos);
	const next = dir > 0 ? $pos.nodeAfter : $pos.nodeBefore;
	if (standsAt(view, $pos) && !(pastLine && next && !next.isText)) return TextSelection.create(doc, pos);
	if (next && !next.isText && NodeSelection.isSelectable(next)) return NodeSelection.create(doc, dir > 0 ? pos : pos - next.nodeSize);
	return $pos.parent.isTextblock ? EDGE : TextSelection.create(doc, dir > 0 ? $pos.after() : $pos.before());
}

/** the next grapheme stop of the textblock holding `head` */
function graphemeStop(view: VisualView, $head: ResolvedPos, dir: -1 | 1): number {
	let depth = $head.depth;
	while (depth > 0 && !$head.node(depth).isTextblock) depth--;
	const stops = view.canvas.geometry.stopsOf($head.before(depth)).positions;
	const head = $head.pos;
	const next = dir > 0 ? stops.find((stop) => stop > head) : stops.findLast((stop) => stop < head);
	return next ?? head + dir;
}

/** one step from `$head` in `dir`; `extend` keeps `anchor` and passes every inline node whole but a source chip */
function stepFrom(view: VisualView, $head: ResolvedPos, dir: -1 | 1, anchor: number | null): InlineStep {
	const { doc } = view.state;
	function to(pos: number, pastLine = false): InlineStep {
		return anchor !== null ? TextSelection.create(doc, anchor, pos) : land(view, pos, dir, pastLine);
	}
	const beside = dir > 0 ? $head.nodeAfter : $head.nodeBefore;
	if (!beside) return $head.parent.isTextblock ? EDGE : to(dir > 0 ? $head.after() : $head.before());
	if (beside.isText) return to(graphemeStop(view, $head, dir));
	const pos = dir > 0 ? $head.pos : $head.pos - beside.nodeSize;
	const policy = caretPolicyOf(view, beside);
	// a source chip shows its text, which the caret walks
	if (policy === 'text' || policy === 'island') return to(dir > 0 ? pos + 1 : pos + beside.nodeSize - 1);
	if (anchor === null && policy === 'formula' && NodeSelection.isSelectable(beside)) return NodeSelection.create(doc, pos);
	return to(dir > 0 ? pos + beside.nodeSize : pos, policy === 'ownLine');
}

/** Left or Right inside the selection's textblock, in logical `dir`; null when the key is not the engine's here */
export function inlineStep(view: VisualView, dir: -1 | 1, extend: boolean): InlineStep | null {
	const { selection, doc } = view.state;
	if (selection instanceof NodeSelection && selection.node.isInline) {
		if (extend) return null;
		return land(view, dir > 0 ? selection.to : selection.from, dir, onOwnLine(view, selection.node));
	}
	if (!(selection instanceof TextSelection)) return null;
	if (!extend && !selection.empty) return TextSelection.create(doc, dir < 0 ? selection.from : selection.to);
	return stepFrom(view, selection.$head, dir, extend ? selection.anchor : null);
}

/** Up or Down beside a chip on a line of its own: the chip is selected, and from it the line past it; null otherwise */
export function ownLineVertical(view: VisualView, dir: -1 | 1): InlineStep | null {
	const { selection, doc } = view.state;
	if (selection instanceof TextSelection && selection.empty) {
		const chip = dir < 0 ? selection.$head.nodeBefore : selection.$head.nodeAfter;
		return chip && onOwnLine(view, chip) ? NodeSelection.create(doc, dir < 0 ? selection.head - chip.nodeSize : selection.head) : null;
	}
	if (!(selection instanceof NodeSelection) || !selection.node.isInline || !onOwnLine(view, selection.node)) return null;
	const edge = dir < 0 ? selection.from : selection.to;
	const $edge = doc.resolve(edge);
	const next = dir < 0 ? $edge.nodeBefore : $edge.nodeAfter;
	if (next?.isText) return TextSelection.create(doc, edge);
	if (next) return NodeSelection.isSelectable(next) ? NodeSelection.create(doc, dir < 0 ? edge - next.nodeSize : edge) : null;
	return EDGE;
}
