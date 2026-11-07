import { faceOf, printedBy, readPackageUse, typstScopeOfDrawing, type ChipFace } from '$lib/languages/typst/visual/core';

export function packageFace(source: string, drawByName: (source: string) => ChipFace | null): ChipFace | null {
	const written = source.trim();
	const use = readPackageUse(written, typstScopeOfDrawing(written));
	if (!use) return null;
	const value = use.found.entry.value;
	const drawn = value && !use.call ? drawByName(`#${value}`) : null;
	if (drawn) return drawn;
	const text = use.found.entry.block === true ? null : printedBy(use);
	if (text === null) return null;
	return text.trim() ? faceOf(text, 'drawn-typst-printed', written) : faceOf(use.name, 'drawn-typst-quiet', written);
}
