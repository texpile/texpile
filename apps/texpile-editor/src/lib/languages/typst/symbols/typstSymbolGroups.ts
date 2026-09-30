import type { TypstSymbolCategory } from './typstSymbolTable';
import type { TypstSymbolGroup } from './typstSymbol.types';
import { m } from '$lib/paraglide/messages';

/** each tab and, in the order they are listed there, the categories it holds */
const GROUP_CATEGORIES: Record<TypstSymbolGroup, readonly TypstSymbolCategory[]> = {
	greek: ['greek', 'hebrew', 'cyrillic', 'doubleStruck'],
	operators: ['arithmetic', 'setTheory', 'calculus', 'logic', 'functionAndCategoryTheory', 'numberTheory', 'algebra', 'gameTheory'],
	relations: ['relation'],
	arrows: ['arrow'],
	delimiters: ['delimiter'],
	punctuation: ['punctuation', 'accent'],
	shapes: ['shape', 'geometry'],
	other: ['misc', 'miscellany', 'currency', 'music', 'astronomical'],
	spaces: ['space', 'control'],
	emoji: ['emoji']
};

export const TYPST_SYMBOL_GROUPS = Object.keys(GROUP_CATEGORIES) as TypstSymbolGroup[];

export function typstSymbolGroupCategories(group: TypstSymbolGroup): readonly TypstSymbolCategory[] {
	return GROUP_CATEGORIES[group];
}

export function typstSymbolGroupLabel(group: TypstSymbolGroup): string {
	switch (group) {
		case 'greek':
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
		case 'shapes':
			return m.symbols_group_shapes();
		case 'other':
			return m.symbols_group_other();
		case 'spaces':
			return m.symbols_group_spaces();
		case 'emoji':
			return m.symbols_group_emoji();
	}
}
