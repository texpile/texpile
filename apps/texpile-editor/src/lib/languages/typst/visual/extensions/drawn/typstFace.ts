// what a Typst chip draws as: a comment folded to a line, or the one call it is (a footnote, a break, a space, an
// outline, a set rule); any other chip stays code
import type { ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import { dividerFace } from '$lib/editor/visual/extensions/drawnChips/dividerFace';
import { footnoteFace } from '$lib/editor/visual/extensions/drawnChips/footnoteFace';
import { horizontalSpaceFace, verticalSpaceFace } from '$lib/editor/visual/extensions/drawnChips/spaceFace';
import { typstCommentFace } from '../typstCommentFace';
import { readFootnote } from './footnoteCall';
import { readBreak } from './breakCall';
import { readSpacing } from './spacingCall';
import { readOutline } from './outlineCall';
import { outlineLabel } from './outlineLabel';
import { readSetRule } from './setRule/setRuleCall';
import { setRuleFace } from './setRule/setRuleFace';
import { m } from '$lib/paraglide/messages';

function callFace(source: string): ChipFace | null {
	const footnote = readFootnote(source);
	if (footnote) return footnoteFace(0, null, footnote.note);
	const breaking = readBreak(source);
	if (breaking) return dividerFace(breaking.kind === 'column' ? m.drawn_chip_typst_column_break() : m.drawn_chip_page_label(), source);
	const space = readSpacing(source);
	if (space?.vertical) return verticalSpaceFace('#v', space.length, space.amount.replace(/\s+/g, ' ').trim(), source);
	if (space) return horizontalSpaceFace(space.length, source, true);
	const outline = readOutline(source);
	if (outline) return dividerFace(outlineLabel(outline), source);
	const rule = readSetRule(source);
	return rule ? setRuleFace(rule, source) : null;
}

export function typstFace(source: string): ChipFace | null {
	return typstCommentFace(source) ?? callFace(source);
}
