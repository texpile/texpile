// a raw block holding one picture alone, drawn as the picture's card on the canvas
import type { CanvasNodeViewConstructor } from '$lib/editor/canvas';
import type { FigureLanguage } from '$lib/draw/editor';
import { drawnChipView } from '$lib/editor/visual/extensions/drawnChips/drawnChipView';
import { pictureKey } from '../drawingCache';
import { pictureIndex, pictureOf } from './figureBlocks';
import { figureCardFace } from './figureCardFace';
import { OPEN_FIGURE, type OpenFigureDetail } from './figureEvents';

/** fromPdf: the compiled PDF can draw the picture (TikZ; CeTZ has no SyncTeX) */
export function figureCardChipView(language: FigureLanguage, title: () => string, fromPdf: boolean): CanvasNodeViewConstructor {
	return (node, view, getPos, decorations) => {
		const picture = pictureOf(language, node.textContent) ?? '';
		function index(): number {
			const pos = getPos();
			return pos === undefined ? 0 : pictureIndex(language, view, pos);
		}
		const face = figureCardFace({
			key: pictureKey(picture),
			picture,
			index,
			title: title(),
			fromPdf,
			open() {
				const detail: OpenFigureDetail = { index: index(), source: picture };
				window.dispatchEvent(new CustomEvent(OPEN_FIGURE, { detail }));
			}
		});
		for (const key of face.reads ?? []) view.canvas.build.read(key, () => null);
		return drawnChipView(face, true, view, getPos, decorations);
	};
}
