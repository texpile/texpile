// how a LaTeX raw chip is drawn, edited and read again once edited
import type { EditorView } from 'prosemirror-view';
import type { DrawnChipKind } from '$lib/editor/visual/extensions/drawnChips/DrawnChipView';
import { chipReplacement } from '$lib/editor/visual/extensions/drawnChips/chipReparse';
import { InlineLatexView } from '$lib/editor/visual/extensions/raw-latex/inlineLatexView';
import { RawLatexView } from '$lib/editor/visual/extensions/raw-latex/rawLatexView';
import { latexToProseMirror } from '$lib/languages/latex/parser/converter';
import { jumpToLabel } from '../ref/jumpToLabel';
import { latexFace } from './latexFace';
import { latexChipSettings } from './settings/latexChipSettings';
import { macroCaret, macroFooter } from './ownMacro/macroFooter';

function parsed(source: string) {
	try {
		return latexToProseMirror(source).doc;
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
		makeFace: (source) => latexFace(source, block),
		makeSource: (node, v, getPos) => (block ? new RawLatexView(node, v, getPos) : new InlineLatexView(node, v, getPos)),
		reparse: (source, chip) => chipReplacement(parsed(source), chip, block),
		settingsFor: latexChipSettings,
		jump: (label) => jumpToLabel(view, label, onJumpToLabel),
		jumpToDefinition: (name) => void onJumpToDefinition?.(name),
		footerFor: (source) => macroFooter(source, (name) => void onJumpToDefinition?.(name)),
		caretFor: macroCaret
	};
}
