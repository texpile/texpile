import {
	type ChipFace,
	type TypstDrawer,
	environmentCard,
	faceOfDrawing,
	blockMarkup,
	withoutTrailingLabel,
	typstScopeOfDrawing,
	readPackageUse
} from '$lib/languages/typst/visual/core';

const PASSES_BODY = /^\{[\w-]+\}$/;

export function bodyFace(source: string, drawer: TypstDrawer): ChipFace | null {
	const written = source.trim();
	const use = readPackageUse(withoutTrailingLabel(written), typstScopeOfDrawing(written));
	const { entry } = use?.found ?? {};
	if (!use?.call?.bodies.length || entry?.kind !== 'function' || entry.block !== true) return null;
	const [only] = use.call.bodies;
	const passes = use.call.bodies.length === 1 && use.call.args.length === 0 && PASSES_BODY.test(entry.prints ?? '');
	const drawing = passes ? drawer.drawMarkup(blockMarkup(only)) : environmentCard(use.name, use.call, drawer);
	return drawing ? faceOfDrawing(drawing, written) : null;
}
