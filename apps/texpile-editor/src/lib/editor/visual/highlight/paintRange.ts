// One painter for every range the editor shades: the live selection, the selection held while a
// menu owns the focus, the passage a comment composer is being written for, a placed thread, a
// peer's selection. What they share is the hard part. The browser paints a range over text and
// nothing else, and only while the editor holds focus, so a formula, a code island, an included
// file, a divider and an unfocused editor all get nothing and have to be drawn to match.
//
// A caller says what the browser is already doing for it and how far the shade should reach; the
// painter draws the rest. One class, one colour variable, so a range cannot look like two things.
import type { Node as PMNode } from 'prosemirror-model';
import { Decoration } from 'prosemirror-view';
import './rangeHighlight.css';

// the browser paints no selection over these: the CodeMirror islands, formulas, an included file,
// a divider, an image. chips (citation, ref, typ_ref) are plain inline spans it paints on its own
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

/** the CodeMirror blocks that can draw a thread's own characters (cmComments.ts) */
const MIRRORING_TYPES = new Set(['code_block', 'raw_latex']);

export type PaintedRange = {
	from: number;
	to: number;
	/** any css colour: the selection's own, a thread's tint, a peer's */
	tint: string;
	/** names this range's bands apart from every other painter's */
	key: string;
	/** a selection fills the line box the browser would have painted; a thread's tint hugs its words */
	reach: 'line' | 'text';
	/** the browser is painting this range's text itself, so only what it skips is drawn */
	nativeText?: boolean;
	/** the browser is painting the node this range exactly covers, as it does for a NodeSelection */
	nativeNode?: boolean;
	/** the CodeMirror blocks draw this range's own characters, so they are not shaded whole on top */
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

/** the same for an element a widget builds, which no decoration reaches */
export function tintElement(el: HTMLElement, tint: string): HTMLElement {
	el.classList.add('pm-range');
	el.style.setProperty('--range-tint', tint);
	return el;
}

function attrsOf(r: PaintedRange, shape?: string): Record<string, string> {
	return { ...rangeAttrs(r.tint, [shape, r.class].filter(Boolean).join(' ')), ...r.attrs };
}

export function paintRange(doc: PMNode, r: PaintedRange): Decoration[] {
	if (r.to <= r.from) return [];
	if (r.whole) return [Decoration.node(r.from, r.to, attrsOf(r))];

	const out: Decoration[] = [];
	if (!r.nativeText) out.push(Decoration.inline(r.from, r.to, attrsOf(r, r.reach === 'line' ? 'pm-range-text' : undefined)));
	doc.nodesBetween(r.from, r.to, (node, pos) => {
		const start = pos;
		const end = pos + node.nodeSize;
		if (start === end || node.isText) return;
		if (!DRAWN_TYPES.has(node.type.name)) return !node.isAtom;
		if (r.nativeNode && r.from === start && r.to === end) return false;
		if (r.mirrored && MIRRORING_TYPES.has(node.type.name)) return false;
		// a range that covers a code block from its outside edges is crossing it; inside means within its text
		const inside = node.content.size > 0 ? r.from > start && r.to < end : r.from >= start && r.to <= end;
		if (ENTERED_TYPES.has(node.type.name) && inside) return false;
		// an inline element's own height is not its line's, so a shade meant to reach the line box
		// is measured by rangeBands.ts and named here
		const band = r.reach === 'line' && node.isInline ? { 'data-band': `${r.key}-${start}` } : {};
		out.push(Decoration.node(start, end, { ...attrsOf(r, 'pm-range-node'), ...band }));
		return !node.isAtom;
	});
	return out;
}

export function paintRanges(doc: PMNode, ranges: PaintedRange[]): Decoration[] {
	return ranges.flatMap((r) => paintRange(doc, r));
}
