import { faceOfParts, type ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import { destroyParts, type Drawing } from '../reading/drawing';
import { switchFace } from '../parts/switchFace';
import { characterPart } from '../parts/textParts';
import { leadersFace } from './leadersPart';
import { ownMacroBody, ownMacroFace } from './ownMacroFace.svelte';

export const MOST_DEPTH = 6;

export function ownMacroPart(
	name: string,
	source: string,
	d: Drawing,
	drawParts: (latex: string, d: Drawing) => ChipFace[] | null
): ChipFace | ChipFace[] | null {
	const body = ownMacroBody(name, source);
	if (body === null || d.depth >= MOST_DEPTH) return null;
	if (body && !body.trim()) return characterPart(' ');
	const inner: Drawing = { ...d, block: false, top: false, depth: d.depth + 1 };
	const probe = drawParts(body, inner);
	if (probe && !probe.length) return d.top ? switchFace(name, source) : [];
	if (probe?.every((part) => part.line)) return faceOfParts(probe, false);
	destroyParts(probe);
	if (probe && !probe.some((part) => part.line)) {
		return ownMacroFace(name, source, (latex) => {
			const parts = drawParts(latex, inner);
			return parts?.length ? faceOfParts(parts, false) : null;
		});
	}
	return leadersFace(body, source);
}
