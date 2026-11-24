// how a Typst raw chip is drawn (a comment folded to a line, a footnote, a break, a space, an outline, a set rule),
// edited and read again once edited
import type { ChipDrawing } from '$lib/editor/visual/extensions/drawnChips/chipShows';
import type { DrawnChipKind } from '$lib/editor/visual/extensions/drawnChips/chipKind';
import { chipReplacement } from '$lib/editor/visual/extensions/drawnChips/chipReparse';
import { typstToProseMirror } from '../convert/converter';
import { typstFace } from '../core/walk/typstFace';
import { typstChipSettings } from '../core/plugin/typstChipSettings';
import { hashedCode } from '../core/code/codeSource';
import { isFigureBlock } from '$lib/draw/host/card/figureBlocks';
import { cetzLanguage } from '$lib/draw/cetz/cetzLanguage';
import { isTypstBibliography } from './typstBibliography';

function parsed(source: string) {
	try {
		return typstToProseMirror(source).doc;
	} catch {
		return null;
	}
}

export const TYPST_CHIP_DRAWING: ChipDrawing = {
	language: 'typst',
	shows(source, block) {
		if (block && isTypstBibliography(source)) return 'bibliography';
		return block && isFigureBlock(cetzLanguage, source) ? 'figure-card' : 'face';
	},
	face: (source) => typstFace(source)
};

export function typstChipKind(block: boolean): DrawnChipKind {
	return {
		block,
		language: 'typst',
		reparse: (source, chip) => (hashedCode(source) !== source ? null : chipReplacement(parsed(source), chip, block)),
		settingsFor: typstChipSettings,
		jump: () => {},
		jumpToDefinition: () => {}
	};
}
