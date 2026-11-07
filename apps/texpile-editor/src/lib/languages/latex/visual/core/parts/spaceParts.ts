import type { ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';

export function isSpacePart(part: ChipFace): boolean {
	const only = part.dom.childNodes.length === 1 ? part.dom.firstChild : null;
	return only?.nodeType === 3 && !only.textContent?.trim();
}

export function trimmedParts(parts: ChipFace[] | null): ChipFace[] | null {
	if (!parts) return null;
	let from = 0;
	let to = parts.length;
	while (from < to && isSpacePart(parts[from])) from++;
	while (to > from && isSpacePart(parts[to - 1])) to--;
	parts.slice(0, from).forEach((part) => part.destroy?.());
	parts.slice(to).forEach((part) => part.destroy?.());
	return parts.slice(from, to);
}
