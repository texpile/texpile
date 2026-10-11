// The structures the math search offers: the math toolbar's entries with a place to type into (a
// fraction, a root, a matrix, cases), found by their name or the commands they are made of.
import { SYMBOL_GROUPS, symbolTooltip } from '$lib/editor/visual/toolbar/mathSymbols';

export type MathStructure = {
	/** the template the toolbar inserts, holes marked as MathLive marks them */
	latex: string;
	/** a Typst snippet's body is Typst source, not LaTeX */
	format?: 'latex' | 'typst';
	label: string;
	/** what its row draws: the template filled in */
	display: string;
	words: readonly string[];
};

// \left( \right) and \begin{} \end{} say nothing of what a structure is
const NOT_NAMES = new Set(['left', 'right', 'begin', 'end', 'mathrm']);

function wordsOf(text: string): string[] {
	return text
		.toLowerCase()
		.split(/[^\p{L}\p{N}]+/u)
		.filter(Boolean);
}

export function mathStructures(): MathStructure[] {
	const seen = new Set<string>();
	const structures: MathStructure[] = [];
	for (const group of SYMBOL_GROUPS)
		for (const entry of group.symbols) {
			if (!entry.latex.includes('#') || seen.has(entry.latex)) continue;
			seen.add(entry.latex);
			const label = symbolTooltip(entry) ?? entry.latex;
			const commands = [...entry.latex.matchAll(/\\(?:begin\{)?([a-zA-Z]+)/g)].map((m) => m[1].toLowerCase());
			structures.push({
				latex: entry.latex,
				label,
				display: entry.displayLatex ?? entry.latex,
				words: [...wordsOf(label), ...commands.filter((c) => !NOT_NAMES.has(c))]
			});
		}
	return structures;
}

/** every structure each word of `query` begins a word of, those whose name begins with it first */
export function searchStructures(structures: readonly MathStructure[], query: string): MathStructure[] {
	const terms = wordsOf(query);
	if (!terms.length) return [...structures];
	const whole = query.trim().toLowerCase();
	return structures
		.filter((s) => terms.every((t) => s.words.some((w) => w.startsWith(t))))
		.map((s, order) => ({ s, order, leads: s.label.toLowerCase().startsWith(whole) }))
		.sort((a, b) => Number(b.leads) - Number(a.leads) || a.order - b.order)
		.map(({ s }) => s);
}
