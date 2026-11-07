import type { ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import type { SourceUnit } from '$lib/languages/latex/parser/tree/walk/sourceUnits';
import { horizontalSpaceFace } from '$lib/editor/visual/extensions/drawnChips/spaceFace';
import { texLength } from '../reading/texLength';
import { styledPart, textPart } from '../parts/textParts';

export function kernRun(
	units: SourceUnit[],
	i: number,
	src: string,
	drawUnit: (unit: SourceUnit) => ChipFace[] | null
): { parts: ChipFace[]; skip: number; afterWord: boolean } | null {
	const { piece, call } = units[i];
	const next = units[i + 1]?.piece;
	const length = next?.kind === 'word' ? /^[+-]?\d*\.?\d+[a-z]{2}/.exec(src.slice(next.from, next.to))?.[0] : undefined;
	const size = length ? texLength(length) : null;
	if (!next || !length || !size || !('em' in size)) return null;
	if (call?.name !== 'kern') {
		const boxed = units[i + 2] ? drawUnit(units[i + 2]) : null;
		const moved = boxed && styledPart({ position: 'relative', top: `${call?.name === 'lower' ? size.em : -size.em}em` }, boxed, false);
		return moved ? { parts: [moved], skip: 2, afterWord: false } : null;
	}
	const parts = [horizontalSpaceFace(size, src.slice(piece.from, next.from + length.length), false)];
	const glued = src.slice(next.from + length.length, next.to);
	if (glued) parts.push(textPart(glued));
	return { parts, skip: 1, afterWord: !glued };
}
