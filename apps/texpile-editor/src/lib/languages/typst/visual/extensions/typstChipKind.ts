// how a Typst raw chip is drawn (a comment folded to a line, a footnote, a break, a space, an outline, a set rule),
// edited and read again once edited
import type { DrawnChipKind } from '$lib/editor/visual/extensions/drawnChips/DrawnChipView';
import { chipReplacement } from '$lib/editor/visual/extensions/drawnChips/chipReparse';
import { InlineLatexView } from '$lib/editor/visual/extensions/raw-latex/inlineLatexView';
import { RawLatexView } from '$lib/editor/visual/extensions/raw-latex/rawLatexView';
import { typstToProseMirror } from '../convert/converter';
import { typstFace } from './drawn/typstFace';
import { typstChipSettings } from './drawn/settings/typstChipSettings';

function parsed(source: string) {
	try {
		return typstToProseMirror(source).doc;
	} catch {
		return null;
	}
}

export function typstChipKind(block: boolean): DrawnChipKind {
	return {
		block,
		language: 'typst',
		makeFace: typstFace,
		makeSource: (node, view, getPos) => (block ? new RawLatexView(node, view, getPos) : new InlineLatexView(node, view, getPos)),
		reparse: (source, chip) => chipReplacement(parsed(source), chip, block),
		settingsFor: typstChipSettings,
		jump: () => {},
		jumpToDefinition: () => {}
	};
}
