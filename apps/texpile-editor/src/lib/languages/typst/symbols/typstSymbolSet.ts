// Typst's symbols in the symbol picker: tinymist's names and categories, searched by name, meaning
// and shorthand, and written the way the caret's place in the document reads them.
import type { SymbolSet } from '$lib/editor/symbols/symbolPicker.types';
import { recentSymbols, rememberSymbol } from '$lib/editor/symbols/symbolRecents';
import { m } from '$lib/paraglide/messages';
import { TYPST_SYMBOL_GROUPS, typstSymbolGroupLabel } from './typstSymbolGroups';
import { invisibleSymbolLabel, typstSymbolGlyphText, typstSymbolSpokenLabel } from './typstSymbolLabels';
import { searchTypstSymbols } from './typstSymbolSearch';
import { computeTypstSymbolInsert, typstSymbolSourceText } from './typstSymbolInsert';
import { insertTypstSymbolVisual, typstSymbolVisualInsertion } from './typstSymbolVisualInsert';
import type { TypstSymbol, TypstSymbolGroup } from './typstSymbol.types';

export const typstSymbolSet: SymbolSet<TypstSymbol> = {
	groups: () => TYPST_SYMBOL_GROUPS,
	groupLabel: (group) => typstSymbolGroupLabel(group as TypstSymbolGroup),
	async load() {
		const { typstSymbolList, typstSymbolByName } = await import('./typstSymbols');
		return { list: typstSymbolList(), byId: typstSymbolByName };
	},
	search: searchTypstSymbols,
	glyph: (symbol) =>
		symbol.invisible ? { kind: 'label', text: invisibleSymbolLabel(symbol) } : { kind: 'text', text: typstSymbolGlyphText(symbol) },
	spokenLabel: typstSymbolSpokenLabel,
	detail: (symbol) => ({
		name: symbol.name,
		description: symbol.unicodeName || undefined,
		note: symbol.mathShorthand ? { label: m.typst_symbols_math_shorthand(), code: symbol.mathShorthand } : undefined
	}),
	searchPlaceholder: () => m.typst_symbols_search_placeholder(),
	recent: () => recentSymbols('recentTypstSymbols'),
	remember: (id) => rememberSymbol('recentTypstSymbols', id),
	insert(target, symbol) {
		if (target.kind === 'source') {
			target.view.dispatch(computeTypstSymbolInsert(target.view.state, symbol));
			target.view.focus();
		} else insertTypstSymbolVisual(target.view, symbol);
	},
	insertionText: (target, symbol) =>
		target.kind === 'source'
			? typstSymbolSourceText(target.view.state, symbol)
			: typstSymbolVisualInsertion(target.view.state.tr, symbol).text
};
