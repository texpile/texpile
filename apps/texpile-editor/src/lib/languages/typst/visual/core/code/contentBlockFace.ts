// `#[..]`, a content value written in the text, drawn as its markup
import type { SyntaxNode } from '@lezer/common';
import type { ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import { childrenOf, hasSyntaxError } from '../../../knowledge/scan/syntax';
import { typstSyntax } from '../reading/typstCall';
import { faceOfDrawing } from '../parts/drawingFace';
import type { TypstDrawer } from '../plugin/typstPlugin';

const QUIET = new Set(['Space', 'LineComment', 'BlockComment']);
const RULES = new Set(['SetRule', 'ShowRule']);

function isContentBlock(source: string): boolean {
	const top = typstSyntax(source);
	if (hasSyntaxError(top)) return false;
	const kids = childrenOf(top).filter((k) => !QUIET.has(k.name));
	const block = kids.length === 2 && kids[0].name === 'Hash' && kids[1].name === 'ContentBlock' && kids[1].to === source.length;
	return block && !holdsRules(kids[1]);
}

// a rule in the block holds for the block alone, which a drawing of the rule as a setting would hide
function holdsRules(block: SyntaxNode): boolean {
	let found = false;
	block.cursor().iterate((n) => {
		if (RULES.has(n.name)) found = true;
		return !found;
	});
	return found;
}

export function contentBlockFace(source: string, drawer: TypstDrawer): ChipFace | null {
	const written = source.trim();
	if (!written.startsWith('#[') || !isContentBlock(written)) return null;
	const drawing = drawer.drawMarkup(written.slice(2, -1));
	return drawing ? faceOfDrawing(drawing, written) : null;
}
