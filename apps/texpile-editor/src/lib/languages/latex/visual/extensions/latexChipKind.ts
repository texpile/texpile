// how a LaTeX raw chip is drawn, edited and read again once edited
import type { EditorView } from 'prosemirror-view';
import type { DrawnChipKind } from '$lib/editor/visual/extensions/drawnChips/DrawnChipView';
import { chipReplacement } from '$lib/editor/visual/extensions/drawnChips/chipReparse';
import { InlineLatexView } from '$lib/editor/visual/extensions/raw-latex/inlineLatexView';
import { RawLatexView } from '$lib/editor/visual/extensions/raw-latex/rawLatexView';
import { treeToProseMirror } from '$lib/languages/latex/parser/tree/importTree';
import { jumpToLabel } from './ref/jumpToLabel';
import { latexFace } from '../core/walk/drawUnits';
import { latexChipSettings } from '../core/latexChipSettings';
import { macroCaret, macroFooter } from '../core/own/macroFooter';
import { figureEditAction } from './figureEditAction';
import { blockChipView, inlineChipView } from './chipViewKind';

function parsed(source: string) {
	try {
		return treeToProseMirror(source).doc;
	} catch {
		return null;
	}
}

export function latexChipKind(
	view: EditorView,
	block: boolean,
	onJumpToLabel?: (name: string) => boolean,
	onJumpToDefinition?: (name: string) => boolean
): DrawnChipKind {
	return {
		block,
		language: 'latex',
		takes: (source) => (block ? blockChipView(source) : inlineChipView(source)) === 'chip',
		makeFace: (source) => latexFace(source, block),
		makeSource: (node, v, getPos) => (block ? new RawLatexView(node, v, getPos) : new InlineLatexView(node, v, getPos)),
		reparse: (source, chip) => chipReplacement(parsed(source), chip, block),
		settingsFor: latexChipSettings,
		jump: (label) => jumpToLabel(view, label, onJumpToLabel),
		jumpToDefinition: (name) => void onJumpToDefinition?.(name),
		footerFor: (source) => macroFooter(source, (name) => void onJumpToDefinition?.(name)),
		caretFor: macroCaret,
		actionFor: figureEditAction
	};
}
