// how a LaTeX drawn chip's panel reads and edits it
import type { EditorView } from 'prosemirror-view';
import type { DrawnChipKind } from '$lib/editor/visual/extensions/drawnChips/chipKind';
import { chipReplacement } from '$lib/editor/visual/extensions/drawnChips/chipReparse';
import { treeToProseMirror } from '$lib/languages/latex/parser/tree/importTree';
import { jumpToLabel } from './ref/jumpToLabel';
import { latexChipSettings } from '../core/latexChipSettings';
import { macroCaret, macroFooter } from '../core/own/macroFooter';
import { figureEditAction } from './figureEditAction';

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
		reparse: (source, chip) => chipReplacement(parsed(source), chip, block),
		settingsFor: latexChipSettings,
		jump: (label) => jumpToLabel(view, label, onJumpToLabel),
		jumpToDefinition: (name) => void onJumpToDefinition?.(name),
		footerFor: (source) => macroFooter(source, (name) => void onJumpToDefinition?.(name)),
		caretFor: macroCaret,
		actionFor: figureEditAction
	};
}
