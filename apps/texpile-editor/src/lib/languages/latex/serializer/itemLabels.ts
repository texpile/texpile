// an item's label, and the body written after it
import type { Ctx } from '$lib/serializer/types';
import type { Ligature } from '../knowledge/commands/commandFacts';
import { TEXT_LIGATURES, TIE } from '../textLigatures';

// the same label written as source and re-serialized from the editor differs by markup, ties,
// dash ligatures and quote curling; those are folded, and any other character typed in counts
function foldedTo({ input, prints }: Ligature): string {
	if (/^-+$/.test(input)) return '-';
	if (/^[`']{2}$/.test(input)) return '"';
	if (/^[`']$/.test(input)) return "'";
	return /^\s*$/.test(prints) ? ' ' : prints;
}

const LABEL_FOLDS = TEXT_LIGATURES.concat(TIE).flatMap((ligature) => {
	const { input, prints } = ligature;
	const folded = foldedTo(ligature);
	return [input, prints].filter((from) => from !== folded).map((from): [string, string] => [from, folded]);
});

export function labelKey(s: string): string {
	let out = s.replace(/\\[a-zA-Z@]+\s*/g, '').replace(/[{}]/g, '');
	for (const [from, to] of LABEL_FOLDS) out = out.replaceAll(from, to);
	return out.replace(/\s+/g, ' ').trim();
}

/** an item body beginning with `[` reads as the item's label, and one beginning with `<` as a
 *  beamer overlay: an empty group in front keeps the bytes text */
export function guardItemBody(body: string): string {
	return /^[[<]/.test(body) ? '{}' + body : body;
}

/** whether `ctx` is the first block of a list item, whose bytes follow \item directly */
export function headsItem(ctx: Ctx | undefined): boolean {
	return !!ctx && ctx.parent?.type.name === 'list' && ctx.index === 0;
}
