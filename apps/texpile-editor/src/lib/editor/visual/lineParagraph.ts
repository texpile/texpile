// a paragraph holding only chips drawn on lines of their own (\appendix, \medskip, \makeatletter) is a block to the caret:
// the caret at its edge read as an empty line, typing there wrote beside the chip, and no gap showed beside it
import type { Node, ResolvedPos } from 'prosemirror-model';
import { GapCursor } from 'prosemirror-gapcursor';
import { drawnChipOf } from '$lib/editor/visual/extensions/drawnChips/DrawnChipView';

export function isLineParagraph(node: Node | null | undefined): boolean {
	if (!node?.isTextblock || node.childCount === 0) return false;
	let chips = 0;
	let other = false;
	node.forEach((child) => {
		if (child.isText && !child.text!.trim()) return;
		if (drawnChipOf(child)?.ownLine) chips++;
		else other = true;
	});
	return chips > 0 && !other;
}

/** the chip on a line of its own an arrow or a key meets first entering the textblock at `pos` going `dir`, if the
 *  textblock begins (going forward) or ends (going back) with one: the browser had no line for a caret beside it, and
 *  drew it at the end of \appendix's divider, where it read as the divider's own tick */
export function lineChipAtEdge(node: Node | null | undefined, pos: number, dir: -1 | 1): number | null {
	if (!node?.isTextblock) return null;
	let edge: { child: Node; offset: number } | null = null;
	node.forEach((child, offset) => {
		if (child.isText && !child.text!.trim()) return;
		if (dir < 0 || !edge) edge = { child, offset };
	});
	const found = edge as { child: Node; offset: number } | null;
	return found && drawnChipOf(found.child)?.ownLine ? pos + 1 + found.offset : null;
}

// the stock rule (prosemirror-gapcursor's closedBefore, closedAfter and valid) with a line paragraph closed
function closedNode(node: Node): boolean | null {
	if ((node.childCount === 0 && !node.inlineContent) || node.isAtom || node.type.spec.isolating || node.type.spec.createGapCursor)
		return true;
	if (isLineParagraph(node)) return true;
	return node.inlineContent ? false : null;
}

function closedSide($pos: ResolvedPos, dir: -1 | 1): boolean {
	for (let d = $pos.depth; d >= 0; d--) {
		const parent = $pos.node(d);
		const index = dir < 0 ? $pos.index(d) : $pos.indexAfter(d);
		if (dir < 0 ? index === 0 : index === parent.childCount) {
			if (parent.type.spec.isolating) return true;
			continue;
		}
		for (let node: Node | null = parent.child(dir < 0 ? index - 1 : index); node; node = dir < 0 ? node.lastChild : node.firstChild) {
			const closed = closedNode(node);
			if (closed !== null) return closed;
		}
		return false;
	}
	return true;
}

function validBesideLines($pos: ResolvedPos): boolean {
	const { parent } = $pos;
	if (parent.inlineContent || !closedSide($pos, -1) || !closedSide($pos, 1)) return false;
	const override = parent.type.spec.allowGapCursor as boolean | undefined;
	if (override != null) return override;
	return parent.contentMatchAt($pos.index()).defaultType?.isTextblock ?? false;
}

type GapRule = { valid($pos: ResolvedPos): boolean };
let widened = false;

// the plugin's arrows, clicks and mapping, and gapCursorAt, all ask GapCursor.valid: widening it once keeps them agreeing
export function gapsBesideLineParagraphs(): void {
	if (widened) return;
	widened = true;
	const rule = GapCursor as unknown as GapRule;
	const stock = rule.valid.bind(GapCursor);
	rule.valid = ($pos) => stock($pos) || validBesideLines($pos);
}
