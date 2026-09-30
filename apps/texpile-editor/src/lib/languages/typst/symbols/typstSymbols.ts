import { TYPST_MARKUP_SHORTHANDS, TYPST_MATH_SHORTHANDS, TYPST_SYMBOL_ROWS, type TypstSymbolCategory } from './typstSymbolTable';
import { TYPST_SYMBOL_GROUPS, typstSymbolGroupCategories } from './typstSymbolGroups';
import type { TypstSymbol, TypstSymbolGroup } from './typstSymbol.types';

// a space, a joiner, a direction mark, a soft hyphen: characters with no ink of their own
const INVISIBLE = /^[\p{Z}\p{C}]+$/u;

let cachedList: TypstSymbol[] | null = null;
let cachedByName: Map<string, TypstSymbol> | null = null;

function symbolFromRow(row: readonly [string, string, string], category: TypstSymbolCategory, group: TypstSymbolGroup): TypstSymbol {
	const [name, value, unicodeName] = row;
	const dot = name.indexOf('.');
	return {
		id: name,
		name,
		path: name.slice(dot + 1),
		module: name.startsWith('emoji.') ? 'emoji' : 'sym',
		value,
		category,
		group,
		unicodeName,
		mathShorthand: TYPST_MATH_SHORTHANDS[name] ?? null,
		markupShorthand: TYPST_MARKUP_SHORTHANDS[name] ?? null,
		invisible: INVISIBLE.test(value)
	};
}

/** every symbol, tab by tab; built once, the table never changes while the app runs */
export function typstSymbolList(): readonly TypstSymbol[] {
	cachedList ??= TYPST_SYMBOL_GROUPS.flatMap((group) =>
		typstSymbolGroupCategories(group).flatMap((category) => TYPST_SYMBOL_ROWS[category].map((row) => symbolFromRow(row, category, group)))
	);
	return cachedList;
}

export function typstSymbolByName(name: string): TypstSymbol | undefined {
	cachedByName ??= new Map(typstSymbolList().map((s) => [s.name, s]));
	return cachedByName.get(name);
}
