// LaTeX's symbols in the symbol picker: Detexify's commands, drawn as LaTeX draws them, searched by
// command, meaning and package, and written the way the caret's place in the document reads them.
import type { SymbolSet } from '$lib/editor/symbols/symbolPicker.types';
import { recentSymbols, rememberSymbol } from '$lib/editor/symbols/symbolRecents';
import { m } from '$lib/paraglide/messages';
import sheetUrl from './latexSymbols.png?url';
import { LATEX_SYMBOL_GROUPS, LATEX_SYMBOL_SHEET, type LatexSymbolGroup } from './latexSymbolGroups';
import { searchLatexSymbols } from './latexSymbolSearch';
import {
	computeLatexSymbolInsert,
	insertLatexSymbolVisual,
	latexSymbolSourceText,
	latexSymbolVisualInsertion,
	latexVisualInsertionText
} from './latexSymbolInsert';
import { offerPackageFor, usepackageFor } from './latexSymbolPackage';
import type { LatexSymbol, LatexSymbolMode } from './latexSymbol.types';

export function latexSymbolGroupLabel(group: LatexSymbolGroup): string {
	switch (group) {
		case 'letters':
			return m.symbols_group_letters();
		case 'operators':
			return m.symbols_group_operators();
		case 'relations':
			return m.symbols_group_relations();
		case 'arrows':
			return m.symbols_group_arrows();
		case 'delimiters':
			return m.symbols_group_delimiters();
		case 'punctuation':
			return m.symbols_group_punctuation();
		case 'phonetic':
			return m.symbols_group_phonetic();
		case 'other':
			return m.symbols_group_other();
		case 'signs':
			return m.symbols_group_signs();
	}
}

function modeLabel(mode: LatexSymbolMode): string {
	switch (mode) {
		case 'text':
			return m.latex_symbols_mode_text();
		case 'math':
			return m.latex_symbols_mode_math();
		case 'both':
			return m.latex_symbols_mode_both();
	}
}

/** `\subsetneq` -> subsetneq: what a screen reader says, since there is no name for the picture */
function spokenCommand(symbol: LatexSymbol): string {
	return symbol.command.replace(/^\\/, '');
}

export const latexSymbolSet: SymbolSet<LatexSymbol> = {
	groups: () => LATEX_SYMBOL_GROUPS,
	groupLabel: (group) => latexSymbolGroupLabel(group as LatexSymbolGroup),
	async load() {
		const { latexSymbolList, latexSymbolById } = await import('./latexSymbols');
		return { list: latexSymbolList(), byId: latexSymbolById };
	},
	search: searchLatexSymbols,
	glyph: ({ picture }) =>
		'letter' in picture
			? { kind: 'text', text: picture.letter }
			: {
					kind: 'picture',
					url: sheetUrl,
					...picture,
					boxHeight: LATEX_SYMBOL_SHEET.boxHeight,
					sheetWidth: LATEX_SYMBOL_SHEET.width,
					sheetHeight: LATEX_SYMBOL_SHEET.height
				},
	spokenLabel: spokenCommand,
	detail(symbol) {
		const line = usepackageFor(symbol);
		return {
			name: symbol.command,
			description: modeLabel(symbol.mode),
			note: line ? { label: m.latex_symbols_needs(), code: line } : undefined
		};
	},
	searchPlaceholder: () => m.latex_symbols_search_placeholder(),
	recent: () => recentSymbols('recentLatexSymbols'),
	remember: (id) => rememberSymbol('recentLatexSymbols', id),
	insert(target, symbol) {
		if (target.kind === 'source') {
			target.view.dispatch(computeLatexSymbolInsert(target.view.state, symbol));
			target.view.focus();
		} else insertLatexSymbolVisual(target.view, symbol);
		offerPackageFor(symbol);
	},
	insertionText: (target, symbol) =>
		target.kind === 'source'
			? latexSymbolSourceText(target.view.state, symbol)
			: latexVisualInsertionText(latexSymbolVisualInsertion(target.view.state.tr, symbol))
};
