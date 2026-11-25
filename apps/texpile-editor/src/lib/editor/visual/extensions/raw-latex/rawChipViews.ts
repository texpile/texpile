// raw_latex and inline_latex (16.1): a chip that draws (chipShows) is the drawn chip view, a placeholder its label, anything
// else stays its source
// in the island view
import type { CanvasNodeViewConstructor, CanvasNodeViews } from '$lib/editor/canvas';
import { chipShows, drawnChipOf, drawnFaceOf, type ChipShows } from '../drawnChips/chipShows';
import { drawnChipView } from '../drawnChips/drawnChipView';
import { offerChipPanels, type ChipKindOf } from '../drawnChips/chipPanel/drawnChipPanel';
import { placeholderChipView } from './placeholderChipView';

/** the views of the kinds a language draws apart, such as a figure card for a block holding one picture */
export type ChipKindViews = Partial<Record<ChipShows, CanvasNodeViewConstructor>>;

function rawChipView(
	source: CanvasNodeViewConstructor,
	block: boolean,
	kindOf?: ChipKindOf,
	kinds: ChipKindViews = {}
): CanvasNodeViewConstructor {
	return (node, view, getPos, decorations, inner) => {
		if (kindOf) offerChipPanels(view, kindOf);
		const shows = chipShows(node);
		if (shows === 'placeholder') return placeholderChipView(node, block, view, getPos);
		const kind = kinds[shows];
		if (kind) return kind(node, view, getPos, decorations, inner);
		const face = drawnChipOf(node) && drawnFaceOf(node);
		if (face) {
			for (const key of face.reads ?? []) view.canvas.build.read(key, () => null);
			return drawnChipView(face, block, view, getPos, decorations);
		}
		const island = source(node, view, getPos, decorations, inner);
		const { update } = island;
		// a source keeps its elements while the user types in it, unless the text now draws
		island.update = (next, outer, deeper) =>
			!drawnChipOf(next) && chipShows(next) !== 'placeholder' && !kinds[chipShows(next)] && !!update?.(next, outer, deeper);
		return island;
	};
}

/** `islands` are the language's island views (14.1), which draw a chip's source; `kindOf` gives a drawn chip its panel */
export function rawChipViews(islands: CanvasNodeViews, kindOf?: ChipKindOf, kinds?: ChipKindViews): CanvasNodeViews {
	return {
		raw_latex: rawChipView(islands.raw_latex, true, kindOf, kinds),
		inline_latex: rawChipView(islands.inline_latex, false, kindOf, kinds)
	};
}
