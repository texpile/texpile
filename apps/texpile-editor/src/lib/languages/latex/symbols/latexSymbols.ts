import { LATEX_SYMBOL_ROWS, type LatexSymbolRow } from './latexSymbolTable';
import { LATEX_SYMBOL_GROUPS } from './latexSymbolGroups';
import type { LatexSymbol } from './latexSymbol.types';

let cachedList: LatexSymbol[] | null = null;
let cachedById: Map<string, LatexSymbol> | null = null;

function symbolFromRow(row: LatexSymbolRow): LatexSymbol {
	const [command, pkg, fontenc, mode, group, place] = row;
	// Detexify's way of naming it, which is what makes the same command from two packages two symbols
	const id = `${pkg || 'latex2e'}-${fontenc || 'OT1'}-${command.replaceAll('\\', '_')}`;
	const picture = typeof place === 'string' ? { letter: place } : { x: place[0], y: place[1], width: place[2], height: place[3] };
	return { id, command, package: pkg, fontenc, mode, group, picture };
}

/** every symbol, tab by tab in the table's order; built once, the table never changes while the app runs */
export function latexSymbolList(): readonly LatexSymbol[] {
	if (!cachedList) {
		const all = LATEX_SYMBOL_ROWS.map(symbolFromRow);
		cachedList = LATEX_SYMBOL_GROUPS.flatMap((group) => all.filter((s) => s.group === group));
	}
	return cachedList;
}

export function latexSymbolById(id: string): LatexSymbol | undefined {
	cachedById ??= new Map(latexSymbolList().map((s) => [s.id, s]));
	return cachedById.get(id);
}
