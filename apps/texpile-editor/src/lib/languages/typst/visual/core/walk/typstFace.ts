// what a Typst chip draws as: a comment, then the plugins the name it uses reaches, then the code the core reads itself
import type { ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import { dividerFace } from '$lib/editor/visual/extensions/drawnChips/dividerFace';
import { m } from '$lib/paraglide/messages';
import { isCropHelper } from '../../extensions/typstImageCrop';
import { codeBlockFace } from '../code/codeBlockFace';
import { hashedCode } from '../code/codeSource';
import { contentBlockFace } from '../code/contentBlockFace';
import { includeFace } from '../code/includeFace';
import { labelChipFace } from '../code/labelChipFace';
import { silentFace } from '../code/silentFace';
import { typstCommentFace } from '../code/typstCommentFace';
import { statementsFace } from '../definitions/statementsFace';
import { drawTypstMarkup } from '../own/markupDrawing';
import { imageDrawn } from '../parts/imageDrawing';
import { ownFace } from '../own/ownFace';
import { chipUseOf } from '../plugin/chipUse';
import { listedPlugins, usePlugins } from '../plugin/pluginMap';
import type { TypstDrawer, TypstFaceCore, TypstPlugin } from '../plugin/typstPlugin';
import { setupFace } from '../setup/setupFace';

const DRAWER: TypstDrawer = { draw: typstFace, drawMarkup: (markup) => drawTypstMarkup(markup, typstFace) };

function pluginFace(plugins: readonly TypstPlugin[], core: TypstFaceCore): ChipFace | null {
	for (const plugin of plugins) {
		const face = plugin.face?.(core);
		if (face) return face;
	}
	return null;
}

function drawByName(source: string): ChipFace | null {
	const read = chipUseOf(source);
	return read && pluginFace(listedPlugins(read.use), { ...DRAWER, source, use: read.use, drawByName, drawImage: imageDrawn });
}

function drawnByPlugin(source: string): ChipFace | null {
	const read = chipUseOf(source);
	return read && pluginFace(usePlugins(read.use, read.scope), { ...DRAWER, source, use: read.use, drawByName, drawImage: imageDrawn });
}

export function typstFace(chip: string): ChipFace | null {
	if (isCropHelper(chip)) return dividerFace(m.drawn_chip_typst_crop_definition(), chip);
	const source = hashedCode(chip);
	return (
		typstCommentFace(source) ??
		drawnByPlugin(source) ??
		setupFace(source) ??
		labelChipFace(source) ??
		silentFace(source) ??
		codeBlockFace(source, typstFace) ??
		includeFace(source) ??
		contentBlockFace(source, DRAWER) ??
		ownFace(source, DRAWER) ??
		statementsFace(source, DRAWER)
	);
}
