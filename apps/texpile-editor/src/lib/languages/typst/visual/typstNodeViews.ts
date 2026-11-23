// the Typst node views the mount passes to the view (8.7): the core's, the plugins' canvasViews, formulas and raw chips
import {
	canvasViewProps,
	composeNodeViews,
	coreMarkViews,
	coreNodeViews,
	islandNodeViews,
	mathNodeViews,
	type CanvasViewProps
} from '$lib/editor/canvas';
import { registerChipDrawing } from '$lib/editor/visual/extensions/drawnChips/chipShows';
import { MATH_SETTINGS } from '$lib/editor/canvas/math/mathSettingsOffer';
import { CODE_SETTINGS } from '$lib/editor/canvas/islands/codeSettingsOffer';
import { rawChipViews } from '$lib/editor/visual/extensions/raw-latex/rawChipViews';
import { imageViews } from '$lib/editor/visual/extensions/image/canvas/imageView';
import { tableViews } from '$lib/editor/visual/extensions/table/canvas/tableViews';
import { pluginCanvasViews } from './core/plugin/editorPieces';
import { typstToProseMirror } from './convert/converter';
import { typstLayoutViews } from './extensions/layout/canvas/typstLayoutViews';
import { TYPST_CHIP_DRAWING, typstChipKind } from './extensions/typstChipKind';
import { typSchema } from './schema';

import { figureCardChipView } from '$lib/draw/host/card/figureCardChip';
import { bibliographyChipView } from '$lib/editor/visual/extensions/bibliography/bibliographyCard.svelte';
import { typstBibliography } from './extensions/typstBibliography';
import { cetzLanguage } from '$lib/draw/cetz/cetzLanguage';
import { m } from '$lib/paraglide/messages';
import { includeDocCanvasView } from '$lib/editor/visual/extensions/includedoc/includeDocCanvasView';

export function typstNodeViews(docDir: () => string): CanvasViewProps {
	registerChipDrawing(typSchema, TYPST_CHIP_DRAWING);
	const core = {
		nodeViews: {
			...coreNodeViews(),
			...mathNodeViews('typst'),
			...rawChipViews(islandNodeViews(), (_view, block) => typstChipKind(block), {
				'figure-card': figureCardChipView(cetzLanguage, () => m.figure_card_cetz(), false),
				bibliography: bibliographyChipView(typstBibliography)
			}),
			code_block: islandNodeViews().code_block,
			includedoc: includeDocCanvasView(docDir)
		},
		markViews: coreMarkViews(),
		blockSettings: { block_math: MATH_SETTINGS, code_block: CODE_SETTINGS }
	};
	return canvasViewProps(
		composeNodeViews(
			core,
			pluginCanvasViews({ docDir, parse: (source) => typstToProseMirror(source).doc }),
			tableViews('typst'),
			typstLayoutViews(),
			imageViews('typst')
		)
	);
}
