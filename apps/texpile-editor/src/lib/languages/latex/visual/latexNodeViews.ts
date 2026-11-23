// the LaTeX node views the mount passes to the view (8.7): the core's, the plugins' canvasViews, formulas and raw chips
import {
	canvasViewProps,
	composeNodeViews,
	coreMarkViews,
	coreNodeViews,
	islandNodeViews,
	mathNodeViews,
	type CanvasViewProps
} from '$lib/editor/canvas';
import { MATH_SETTINGS } from '$lib/editor/canvas/math/mathSettingsOffer';
import { CODE_SETTINGS } from '$lib/editor/canvas/islands/codeSettingsOffer';
import { rawChipViews } from '$lib/editor/visual/extensions/raw-latex/rawChipViews';
import { rawFigureChipView } from '$lib/editor/visual/extensions/raw-latex/rawFigureChip';
import { imageViews } from '$lib/editor/visual/extensions/image/canvas/imageView';
import { tableViews } from '$lib/editor/visual/extensions/table/canvas/tableViews';
import { registerLatexCoreDrawing } from './core/faces/latexCoreDrawing';
import { latexChipKind } from './extensions/latexChipKind';
import { ieeeAuthorChipView } from './extensions/template-specific/ieeeAuthorChip';
import { environmentViews } from './extensions/environment/canvas/environmentNodeView';
import { pluginCanvasViews } from './core/plugin/editorPieces';
import type { LatexViewSetup } from './core/plugin/latexPlugin';
import { figureCardChipView } from '$lib/draw/host/card/figureCardChip';
import { bibliographyChipView } from '$lib/editor/visual/extensions/bibliography/bibliographyCard.svelte';
import { latexBibliography } from '$lib/editor/visual/extensions/bibliography/bibliographyNodeView.svelte';
import { tikzLanguage } from '$lib/draw/tikz/tikzLanguage';
import { m } from '$lib/paraglide/messages';

export function latexNodeViews(setup: LatexViewSetup): CanvasViewProps {
	registerLatexCoreDrawing();
	const core = {
		nodeViews: {
			...coreNodeViews(),
			...mathNodeViews('latex'),
			...rawChipViews(islandNodeViews(), (view, block) => latexChipKind(view, block, setup.onJumpToLabel, setup.onJumpToDefinition), {
				'figure-card': figureCardChipView(tikzLanguage, () => m.figure_card_tikz(), true),
				bibliography: bibliographyChipView(latexBibliography),
				'raw-figure': rawFigureChipView(islandNodeViews().raw_latex, setup.imageDir),
				'ieee-author': ieeeAuthorChipView(islandNodeViews().raw_latex)
			}),
			code_block: islandNodeViews().code_block
		},
		markViews: coreMarkViews(),
		blockSettings: { block_math: MATH_SETTINGS, code_block: CODE_SETTINGS }
	};
	return canvasViewProps(composeNodeViews(core, pluginCanvasViews(setup), tableViews('latex'), environmentViews(), imageViews('latex')));
}
