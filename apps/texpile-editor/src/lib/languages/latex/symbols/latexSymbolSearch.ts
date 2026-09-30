import type { LatexSymbol } from './latexSymbol.types';

// LaTeX names are short or run together ("neq", "subsetneq"). These are the words someone
// searching by meaning types for one; a word inside a name ("arrow" in `\leftarrow`) is found as is
const COMMAND_WORDS: Readonly<Record<string, readonly string[]>> = {
	neq: ['not', 'equal'],
	ne: ['not', 'equal'],
	leq: ['less', 'than', 'equal'],
	le: ['less', 'than', 'equal'],
	geq: ['greater', 'than', 'equal'],
	ge: ['greater', 'than', 'equal'],
	ll: ['much', 'less'],
	gg: ['much', 'greater'],
	approx: ['approximately', 'almost', 'equal'],
	equiv: ['equivalent', 'identical'],
	cong: ['congruent'],
	sim: ['similar', 'tilde'],
	simeq: ['similar', 'equal'],
	propto: ['proportional'],
	perp: ['perpendicular'],
	parallel: ['parallel'],
	mid: ['divides'],
	pm: ['plus', 'minus'],
	mp: ['minus', 'plus'],
	times: ['multiply', 'cross'],
	div: ['divide', 'division'],
	cdot: ['dot', 'multiply'],
	ast: ['asterisk'],
	circ: ['compose', 'ring'],
	oplus: ['direct', 'sum', 'circled', 'plus'],
	otimes: ['tensor', 'circled', 'times'],
	infty: ['infinity'],
	partial: ['derivative', 'differential'],
	nabla: ['gradient', 'del'],
	int: ['integral'],
	iint: ['double', 'integral'],
	iiint: ['triple', 'integral'],
	oint: ['contour', 'integral'],
	sum: ['sigma', 'summation'],
	prod: ['product'],
	coprod: ['coproduct'],
	forall: ['for', 'all', 'every'],
	exists: ['there', 'exists', 'some'],
	nexists: ['not', 'exists'],
	emptyset: ['empty', 'set'],
	varnothing: ['empty', 'set'],
	in: ['element', 'member'],
	notin: ['not', 'element', 'member'],
	ni: ['contains', 'member'],
	cup: ['union'],
	cap: ['intersection'],
	bigcup: ['union'],
	bigcap: ['intersection'],
	setminus: ['difference', 'minus'],
	wedge: ['and', 'logical'],
	land: ['and', 'logical'],
	vee: ['or', 'logical'],
	lor: ['or', 'logical'],
	neg: ['not', 'negation', 'logical'],
	lnot: ['not', 'negation', 'logical'],
	// the arrows "arrow" means before the rest of those whose names hold the word
	rightarrow: ['arrow'],
	leftarrow: ['arrow'],
	leftrightarrow: ['arrow'],
	to: ['maps', 'tends', 'right'],
	gets: ['left'],
	mapsto: ['maps'],
	implies: ['then'],
	iff: ['if', 'only'],
	angle: ['angle'],
	hbar: ['planck', 'reduced'],
	ell: ['script', 'letter'],
	Re: ['real', 'part'],
	Im: ['imaginary', 'part'],
	wp: ['weierstrass'],
	aleph: ['cardinal', 'hebrew'],
	dag: ['dagger'],
	ddag: ['double', 'dagger'],
	S: ['section'],
	P: ['paragraph', 'pilcrow'],
	ldots: ['ellipsis', 'dots'],
	cdots: ['ellipsis', 'dots'],
	vdots: ['ellipsis', 'dots', 'vertical'],
	ddots: ['ellipsis', 'dots', 'diagonal'],
	langle: ['angle', 'bracket', 'left'],
	rangle: ['angle', 'bracket', 'right'],
	lceil: ['ceiling', 'left'],
	rceil: ['ceiling', 'right'],
	lfloor: ['floor', 'left'],
	rfloor: ['floor', 'right'],
	star: ['star'],
	bullet: ['dot', 'bullet'],
	checkmark: ['check', 'tick'],
	pounds: ['pound', 'sterling', 'currency'],
	euro: ['currency'],
	texteuro: ['currency']
};

// what a word of meaning is spelled as inside run-together names: "equal" in `\leqslant`, "greater" in `\gtrsim`
const NAME_PARTS: Readonly<Record<string, readonly string[]>> = {
	equal: ['eq'],
	less: ['leq', 'lt'],
	greater: ['gtr', 'geq', 'gt'],
	superset: ['supset'],
	triangle: ['triangle', 'lhd', 'rhd'],
	circle: ['circ', 'odot', 'oplus', 'ominus', 'otimes', 'oslash'],
	square: ['sq', 'box'],
	dots: ['dots']
};

const GREEK =
	/^(?:up|var)?(?:alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega|digamma)$/i;

// how much a query word is worth by where it matched: the command name is what people remember
const NAME_PREFIX_WEIGHT = 30;
const NAME_INSIDE_WEIGHT = 15;
const WORD_WEIGHT = 20;
const NAME_PART_WEIGHT = 12;
const PACKAGE_WEIGHT = 6;
const EXACT_NAME_BONUS = 60;
const SAME_CASE_BONUS = 10;
// a query in small letters means `\rightarrow` before `\Rightarrow`
const SMALL_LETTER_BONUS = 1;
// the kernel's own before a package's copy of it
const KERNEL_BONUS = 2;
// shorter names first: `\to` before `\longrightarrow` when both match
const PER_CHARACTER_PENALTY = 0.2;
const RECENT_BONUS = 12;

type IndexedSymbol = {
	symbol: LatexSymbol;
	name: string;
	lower: string;
	words: readonly string[];
	pkg: string;
	/** `\nleq`: an `n` before a name the table also has, which is how LaTeX spells "not" */
	negated: boolean;
};

const indexes = new WeakMap<readonly LatexSymbol[], IndexedSymbol[]>();

/** `\mathbb{R}` -> mathbb{R}: what a search by name is matched against */
function nameOf(command: string): string {
	return command.replace(/^\\/, '');
}

function indexSymbol(symbol: LatexSymbol, names: ReadonlySet<string>): IndexedSymbol {
	const name = nameOf(symbol.command);
	const words = [...(COMMAND_WORDS[name] ?? []), ...(GREEK.test(name) ? ['greek'] : [])];
	const negated = name.startsWith('not') || (name.startsWith('n') && names.has(name.slice(1)));
	return { symbol, name, lower: name.toLowerCase(), words, pkg: symbol.package.toLowerCase(), negated };
}

function indexOf(symbols: readonly LatexSymbol[]): IndexedSymbol[] {
	let index = indexes.get(symbols);
	if (!index) {
		const names = new Set(symbols.map((s) => nameOf(s.command)));
		index = symbols.map((s) => indexSymbol(s, names));
		indexes.set(symbols, index);
	}
	return index;
}

/** the best a query word does against a symbol; 0 when it matches nothing of it */
function termScore(entry: IndexedSymbol, term: string): number {
	let best = 0;
	const ratio = term.length / entry.lower.length;
	if (entry.lower.startsWith(term)) best = NAME_PREFIX_WEIGHT * (0.5 + 0.5 * ratio);
	else if (entry.lower.includes(term)) best = NAME_INSIDE_WEIGHT * (0.5 + 0.5 * ratio);
	for (const word of entry.words) {
		if (word === term) best = Math.max(best, WORD_WEIGHT);
		else if (word.startsWith(term)) best = Math.max(best, WORD_WEIGHT * 0.6);
	}
	if ((NAME_PARTS[term] ?? []).some((part) => entry.lower.includes(part))) best = Math.max(best, NAME_PART_WEIGHT);
	if (term === 'not' && entry.negated) best = Math.max(best, NAME_PART_WEIGHT);
	if (entry.pkg && entry.pkg.startsWith(term)) best = Math.max(best, PACKAGE_WEIGHT);
	return best;
}

function scoreSymbol(entry: IndexedSymbol, raw: string, terms: readonly string[]): number | null {
	let score = 0;
	for (const term of terms) {
		const s = termScore(entry, term);
		if (s === 0) return null;
		score += s;
	}
	const lower = raw.toLowerCase();
	if (entry.lower === lower) score += EXACT_NAME_BONUS;
	if (entry.name === raw) score += SAME_CASE_BONUS;
	if (raw === lower && /^[a-z]/.test(entry.name)) score += SMALL_LETTER_BONUS;
	if (!entry.symbol.package && !entry.symbol.fontenc) score += KERNEL_BONUS;
	return score - entry.name.length * PER_CHARACTER_PENALTY;
}

/**
 * The symbols a query finds, best first. A query is matched by command, with or without its
 * backslash ("subsetneq", "\alpha", "arrow" inside `\leftarrow`), by meaning ("not equal", "empty
 * set": every word must match), or by package ("stmaryrd"). Recently used symbols rank higher
 * among equals.
 */
export function searchLatexSymbols(symbols: readonly LatexSymbol[], query: string, recent: readonly string[] = []): LatexSymbol[] {
	const raw = nameOf(query.trim());
	if (!raw) return [];
	const terms = raw.toLowerCase().split(/\s+/).map(nameOf).filter(Boolean);
	const recentRank = new Map(recent.map((id, i) => [id, i]));
	const scored: { symbol: LatexSymbol; score: number; order: number }[] = [];
	indexOf(symbols).forEach((entry, order) => {
		const score = scoreSymbol(entry, raw, terms);
		if (score === null) return;
		const rank = recentRank.get(entry.symbol.id);
		scored.push({ symbol: entry.symbol, score: score + (rank === undefined ? 0 : RECENT_BONUS - rank * 0.25), order });
	});
	scored.sort((a, b) => b.score - a.score || a.order - b.order);
	return scored.map((s) => s.symbol);
}
