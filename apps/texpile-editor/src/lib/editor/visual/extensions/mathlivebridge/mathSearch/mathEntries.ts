// What the math search lists in each syntax: every command, symbol and environment MathLive has
// for it, each drawn, described and found by meaning from the symbol picker's own table where that
// table has it.
import type { MathCommand } from 'mathlive';
import type { PickerSymbol, SymbolCatalog, SymbolGlyph, SymbolSet } from '$lib/editor/symbols/symbolPicker.types';
import { latexSymbolSet } from '$lib/languages/latex/symbols/latexSymbolSet';
import type { LatexSymbol } from '$lib/languages/latex/symbols/latexSymbol.types';
import { typstSymbolSet } from '$lib/languages/typst/symbols/typstSymbolSet';
import type { TypstSymbol } from '$lib/languages/typst/symbols/typstSymbol.types';
import { m } from '$lib/paraglide/messages';
import type { MathSyntax } from '../mathFieldFactory';

export type MathEntry = {
	key: string;
	command: MathCommand;
	/** the heading it is listed under when nothing is typed */
	section: string;
	/** the picker's drawing of it; without one, MathLive draws its preview */
	glyph: SymbolGlyph | null;
	note: string;
	/** its names, lower case and without a backslash, as a search matches them */
	names: readonly string[];
	/** the picker's symbol for it, which finds it by meaning and keeps it in the recents */
	symbol: PickerSymbol | null;
};

export type MathEntries = {
	set: SymbolSet<PickerSymbol>;
	catalog: SymbolCatalog<PickerSymbol>;
	entries: readonly MathEntry[];
	bySymbol: ReadonlyMap<string, MathEntry>;
};

const SETS: Record<MathSyntax, SymbolSet<PickerSymbol>> = {
	latex: latexSymbolSet as unknown as SymbolSet<PickerSymbol>,
	typst: typstSymbolSet as unknown as SymbolSet<PickerSymbol>
};

/** how the picker's table names a symbol, as MathLive does */
function pickerName(syntax: MathSyntax, symbol: PickerSymbol): string | null {
	if (syntax === 'latex') return (symbol as LatexSymbol).command;
	const typst = symbol as TypstSymbol;
	return typst.module === 'sym' ? typst.path : null;
}

function noteOf(syntax: MathSyntax, command: MathCommand, symbol: PickerSymbol | null): string {
	const said = syntax === 'latex' ? (symbol as LatexSymbol | null)?.package : (symbol as TypstSymbol | null)?.unicodeName;
	return [said, ...command.aliases].filter(Boolean).join('  ');
}

function sectionOf(syntax: MathSyntax, set: SymbolSet<PickerSymbol>, command: MathCommand, symbol: PickerSymbol | null): string {
	if (command.kind === 'environment') return m.mathsearch_environments();
	if (command.kind === 'function') return syntax === 'latex' ? m.mathsearch_commands() : m.mathsearch_functions();
	return set.groupLabel(symbol?.group ?? 'other');
}

function bareName(name: string): string {
	return name.replace(/^\\begin\{(.*)\}$/, '$1').replace(/^\\/, '');
}

/** a name of it spelled as typed: `Delta` is Δ, not δ */
function spelledAs(entry: MathEntry, spelled: string): boolean {
	return [entry.command.name, ...entry.command.aliases].some((name) => bareName(name) === spelled);
}

const loaded = new Map<MathSyntax, Promise<MathEntries>>();

export function loadMathEntries(syntax: MathSyntax): Promise<MathEntries> {
	let entries = loaded.get(syntax);
	if (!entries) {
		entries = buildEntries(syntax);
		loaded.set(syntax, entries);
	}
	return entries;
}

async function buildEntries(syntax: MathSyntax): Promise<MathEntries> {
	const set = SETS[syntax];
	const [{ getMathCommands }, catalog] = await Promise.all([import('mathlive'), set.load()]);
	const byName = new Map<string, PickerSymbol>();
	for (const symbol of catalog.list) {
		const name = pickerName(syntax, symbol);
		if (name && !byName.has(name)) byName.set(name, symbol);
	}
	// symbols in the picker's order of groups, the ones it does not have with its other symbols; then
	// the commands, then the environments
	const groups = set.groups();
	function rank(entry: MathEntry): number {
		if (entry.command.kind !== 'symbol') return groups.length + (entry.command.kind === 'function' ? 1 : 2);
		const at = groups.indexOf(entry.symbol?.group ?? 'other');
		return at < 0 ? groups.length : at;
	}
	const entries = getMathCommands(syntax).map((command): MathEntry => {
		const symbol = [command.name, ...command.aliases].map((name) => byName.get(name)).find((s) => s !== undefined) ?? null;
		return {
			key: `${command.kind} ${command.name}`,
			command,
			section: sectionOf(syntax, set, command, symbol),
			glyph: symbol ? set.glyph(symbol) : null,
			note: noteOf(syntax, command, symbol),
			names: [command.name, ...command.aliases].map((name) => bareName(name).toLowerCase()),
			symbol
		};
	});
	const ordered = entries.map((entry, order) => ({ entry, order, rank: rank(entry) }));
	ordered.sort((a, b) => a.rank - b.rank || a.order - b.order);
	const sorted = ordered.map(({ entry }) => entry);
	const bySymbol = new Map<string, MathEntry>();
	for (const entry of sorted) if (entry.symbol && !bySymbol.has(entry.symbol.id)) bySymbol.set(entry.symbol.id, entry);
	return { set, catalog, entries: sorted, bySymbol };
}

// past this the matches are too loose to be worth scrolling through, as in the symbol picker
const MAX_FOUND = 200;

/**
 * The entries `query` finds, best first: a name it is, then what the picker finds by meaning, then
 * names it begins, then names it is inside.
 */
export function searchMathEntries(loaded: MathEntries, query: string): MathEntry[] {
	const spelled = query.trim().replace(/^\\/, '');
	const typed = spelled.toLowerCase();
	if (!typed) return [];
	const { set, catalog, entries, bySymbol } = loaded;
	const meaning = new Map<MathEntry, number>();
	set.search(catalog.list, query, set.recent()).forEach((symbol, i) => {
		const entry = bySymbol.get(symbol.id);
		if (entry && !meaning.has(entry)) meaning.set(entry, i);
	});
	const scored: { entry: MathEntry; score: number }[] = [];
	for (const entry of entries) {
		const found = meaning.get(entry);
		const score = entry.names.includes(typed)
			? spelledAs(entry, spelled)
				? 0
				: 0.5
			: found !== undefined
				? 1 + found / 10_000
				: entry.names.some((name) => name.startsWith(typed))
					? 2 + entry.names[0].length / 1000
					: entry.names.some((name) => name.includes(typed))
						? 3 + entry.names[0].length / 1000
						: null;
		if (score !== null) scored.push({ entry, score });
	}
	scored.sort((a, b) => a.score - b.score);
	return scored.slice(0, MAX_FOUND).map(({ entry }) => entry);
}
