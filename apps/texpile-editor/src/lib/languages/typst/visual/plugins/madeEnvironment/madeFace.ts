import {
	type ChipFace,
	type TypstDrawer,
	environmentCard,
	withoutTrailingLabel,
	faceOfDrawing,
	typstScopeOfDrawing,
	readPackageUse
} from '$lib/languages/typst/visual/core';

export function madeFace(source: string, drawer: TypstDrawer): ChipFace | null {
	const written = source.trim();
	const use = readPackageUse(withoutTrailingLabel(written), typstScopeOfDrawing(written));
	if (!use?.call || use.found.entry.kind !== 'value') return null;
	const drawing = environmentCard(use.name, use.call, drawer);
	return drawing ? faceOfDrawing(drawing, written) : null;
}
