import { closeChipPanel, type ChipPanelAction } from '$lib/editor/visual/extensions/drawnChips/chipPanel.svelte';
import { OPEN_FIGURE, type OpenFigureDetail } from '$lib/draw/host/card/figureEvents';
import { m } from '$lib/paraglide/messages';
import { tikzLanguage } from '../core';

export function figureEditAction(source: string): ChipPanelAction | null {
	const pictures = tikzLanguage.listPictures(source);
	if (pictures.length !== 1) return null;
	const detail: OpenFigureDetail = { index: -1, source: source.slice(pictures[0].from, pictures[0].to) };
	return {
		label: m.figure_edit(),
		run: () => {
			closeChipPanel('away');
			window.dispatchEvent(new CustomEvent(OPEN_FIGURE, { detail }));
		}
	};
}
