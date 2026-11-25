// One painter for every range the editor shades: a placed thread, the passage a comment composer is being written
// for, a peer's selection. One class, one color variable, so a range cannot look like two things. The canvas fills
// the words (reachRule.ts) and the nodes named here by their box; it paints the live selection itself.
import type { Node as PMNode } from 'prosemirror-model';
import { Decoration } from 'prosemirror-view';

// nodes drawn by a face of their own: shaded once by their box, as every inline atom (a chip) is
const DRAWN_TYPES = new Set([
	'raw_latex',
	'code_block',
	'block_math',
	'inline_math',
	'inline_latex',
	'includedoc',
	'horizontal_rule',
	'image'
]);

/** a range wholly inside one of these is editing its content, not crossing it */
const ENTERED_TYPES = new Set(['code_block', 'raw_latex', 'inline_latex', 'image']);

/** the code blocks whose own characters take a thread's tint */
const MIRRORING_TYPES = new Set(['code_block', 'raw_latex']);

export type PaintedRange = {
	from: number;
	to: number;
	/** any css colour: the selection's own, a thread's tint, a peer's */
	tint: string;
	/** a selection's shape fills the line box; a thread's tint hugs its words */
	reach: 'line' | 'text';
	/** the code blocks tint this range's own characters, so they are not shaded whole on top */
	mirrored?: boolean;
	/** the caller's own hook, for click targets and state classes */
	class?: string;
	attrs?: Record<string, string>;
	/** the range is one node that draws its own content, tinted entire */
	whole?: boolean;
};

/** how a range is dressed, for a caller that places its own decorations (suggestions) */
export function rangeAttrs(tint: string, className?: string): { class: string; style: string } {
	return { class: className ? `pm-range ${className}` : 'pm-range', style: `--range-tint: ${tint}` };
}

/** the decoration spec that gives the canvas the range's look */
export function rangeSpec(tint: string): { canvasLook: { look: { backgroundColor: string } } } {
	return { canvasLook: { look: { backgroundColor: tint } } };
}

function attrsOf(r: PaintedRange, shape?: string): Record<string, string> {
	return { ...rangeAttrs(r.tint, [shape, r.class].filter(Boolean).join(' ')), ...r.attrs };
}

/** a block drawn whole wears the tint as its own background; an inline atom takes the range's line band instead */
function blockAttrsOf(r: PaintedRange, shape?: string): Record<string, string> {
	const attrs = attrsOf(r, shape);
	return { ...attrs, style: `${attrs.style}; background-color: ${r.tint}` };
}

export function paintRange(doc: PMNode, r: PaintedRange): Decoration[] {
	if (r.to <= r.from) return [];
	if (r.whole) return [Decoration.node(r.from, r.to, doc.nodeAt(r.from)?.isBlock ? blockAttrsOf(r) : attrsOf(r))];

	const out: Decoration[] = [
		Decoration.inline(r.from, r.to, attrsOf(r, r.reach === 'line' ? 'pm-range-text' : undefined), rangeSpec(r.tint))
	];
	doc.nodesBetween(r.from, r.to, (node, pos) => {
		const start = pos;
		const end = pos + node.nodeSize;
		if (start === end || node.isText) return;
		const chip = node.isInline && node.isAtom && node.type.name !== 'hard_break';
		if (!DRAWN_TYPES.has(node.type.name) && !chip) return !node.isAtom;
		if (r.mirrored && MIRRORING_TYPES.has(node.type.name)) return false;
		// a range that covers a code block from its outside edges is crossing it; inside means within its text
		const inside = node.content.size > 0 ? r.from > start && r.to < end : r.from >= start && r.to <= end;
		if (ENTERED_TYPES.has(node.type.name) && inside) return false;
		out.push(Decoration.node(start, end, node.isBlock ? blockAttrsOf(r, 'pm-range-node') : attrsOf(r, 'pm-range-node')));
		return !node.isAtom;
	});
	return out;
}

export function paintRanges(doc: PMNode, ranges: PaintedRange[]): Decoration[] {
	return ranges.flatMap((r) => paintRange(doc, r));
}
