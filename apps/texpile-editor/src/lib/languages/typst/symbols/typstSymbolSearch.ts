import type { TypstSymbol } from './typstSymbol.types';

// Typst spells its names short. These are the words someone searching by meaning types for one
// ("arrow right double", "not equal"); Unicode's character names cover the rest ("rightwards")
const NAME_WORDS: Readonly<Record<string, readonly string[]>> = {
	l: ['left'],
	r: ['right'],
	t: ['top', 'up'],
	b: ['bottom', 'down'],
	tl: ['top', 'left', 'up'],
	tr: ['top', 'right', 'up'],
	bl: ['bottom', 'left', 'down'],
	br: ['bottom', 'right', 'down'],
	eq: ['equal', 'equals'],
	gt: ['greater', 'than'],
	lt: ['less', 'than'],
	sq: ['square'],
	o: ['circle', 'circled'],
	h: ['horizontal'],
	v: ['vertical'],
	c: ['centered'],
	ast: ['asterisk'],
	excl: ['exclamation'],
	quest: ['question'],
	hyph: ['hyphen'],
	co: ['care', 'of'],
	inv: ['inverted'],
	rev: ['reversed'],
	alt: ['alternative'],
	op: ['operator'],
	oo: ['infinity'],
	cw: ['clockwise'],
	ccw: ['counterclockwise', 'anticlockwise'],
	inter: ['intersection'],
	sect: ['intersection'],
	supset: ['superset'],
	diff: ['derivative', 'differential'],
	nobreak: ['nonbreaking']
};

// what whole names go by elsewhere, HTML and LaTeX mostly
const NAME_ALIASES: Readonly<Record<string, readonly string[]>> = {
	'sym.space.nobreak': ['nbsp'],
	'sym.hyph.soft': ['shy'],
	'sym.planck': ['hbar']
};

// how much a query word is worth by where it matched: the Typst name is what people remember
const NAME_WEIGHT = 10;
const NAME_WORD_WEIGHT = 8;
const UNICODE_WEIGHT = 6;
const CATEGORY_WEIGHT = 3;
const EXACT_WORD_BONUS = 3;
const EXACT_NAME_BONUS = 40;
const SAME_CASE_BONUS = 5;
const DOTTED_PREFIX_BONUS = 15;
const EXACT_UNICODE_NAME_BONUS = 30;
// "dot" means `dot.op` before `plus.dot`, "less equal" `lt.eq` before `eq.lt`
const BASE_NAME_BONUS = 4;
const NAME_ORDER_BONUS = 3;
const SHORTHAND_OR_GLYPH_SCORE = 100;
const SHORTHAND_PREFIX_SCORE = 30;
// shorter names first: `arrow.r` before `arrow.r.long.bar` when both match
const PER_PART_PENALTY = 1.5;
// `arrow` means the math arrow far more often than the emoji
const EMOJI_PENALTY = 3;
const RECENT_BONUS = 12;
const PRESENTATION = /[︎️]/g;

/** a word a query can match, and which part of the name it came from (-1: not the name) */
type IndexedWord = { word: string; weight: number; part: number };
type IndexedSymbol = { symbol: TypstSymbol; words: IndexedWord[]; parts: string[] };
type TermMatch = { score: number; part: number };

const indexes = new WeakMap<readonly TypstSymbol[], IndexedSymbol[]>();

/** `functionAndCategoryTheory` -> function and category theory */
function categoryWords(category: string): string[] {
	return category
		.replace(/([a-z])([A-Z])/g, '$1 $2')
		.toLowerCase()
		.split(' ');
}

function indexSymbol(symbol: TypstSymbol): IndexedSymbol {
	const parts = symbol.path.toLowerCase().split('.');
	const words: IndexedWord[] = [
		...parts.map((word, part) => ({ word, weight: NAME_WEIGHT, part })),
		...parts.flatMap((name, part) => (NAME_WORDS[name] ?? []).map((word) => ({ word, weight: NAME_WORD_WEIGHT, part }))),
		...(NAME_ALIASES[symbol.name] ?? []).map((word) => ({ word, weight: NAME_WORD_WEIGHT, part: -1 })),
		...symbol.unicodeName
			.split(/[\s-]+/)
			.filter(Boolean)
			.map((word) => ({ word, weight: UNICODE_WEIGHT, part: -1 })),
		...[symbol.module, ...categoryWords(symbol.category)].map((word) => ({ word, weight: CATEGORY_WEIGHT, part: -1 }))
	];
	return { symbol, words, parts };
}

function indexOf(symbols: readonly TypstSymbol[]): IndexedSymbol[] {
	let index = indexes.get(symbols);
	if (!index) {
		index = symbols.map(indexSymbol);
		indexes.set(symbols, index);
	}
	return index;
}

/** the best a query word does against a symbol's words; null when it matches none of them */
function matchTerm(term: string, words: IndexedWord[]): TermMatch | null {
	let best: TermMatch | null = null;
	for (const { word, weight, part } of words) {
		let score = 0;
		if (word === term) score = weight + EXACT_WORD_BONUS;
		else if (word.startsWith(term)) score = weight * (0.5 + (0.5 * term.length) / word.length);
		if (score > (best?.score ?? 0)) best = { score, part };
	}
	return best;
}

/** a query of punctuation or a pasted glyph: `=>`, `!=`, `⇒` */
function literalScore(symbol: TypstSymbol, raw: string): number {
	const shorthands = [symbol.mathShorthand, symbol.markupShorthand].filter((s): s is string => s !== null);
	if (shorthands.includes(raw) || symbol.value === raw || symbol.value.replace(PRESENTATION, '') === raw) return SHORTHAND_OR_GLYPH_SCORE;
	return shorthands.some((s) => s.startsWith(raw)) ? SHORTHAND_PREFIX_SCORE + raw.length : 0;
}

/** true when the words that hit the name hit its parts left to right, as the query reads */
function inNameOrder(matches: TermMatch[]): boolean {
	const parts = matches.map((match) => match.part).filter((part) => part >= 0);
	return parts.length > 1 && parts.every((part, i) => i === 0 || part > parts[i - 1]);
}

function wordScore(entry: IndexedSymbol, raw: string, query: string, terms: string[]): number {
	const matches: TermMatch[] = [];
	for (const term of terms) {
		const match = matchTerm(term, entry.words);
		if (!match) return 0;
		matches.push(match);
	}
	const { symbol, parts } = entry;
	const path = symbol.path.toLowerCase();
	let score = matches.reduce((sum, match) => sum + match.score, 0);
	if (path === query || symbol.name.toLowerCase() === query) score += EXACT_NAME_BONUS;
	if (symbol.path === raw || symbol.name === raw) score += SAME_CASE_BONUS;
	if (query.includes('.') && (path.startsWith(query) || symbol.name.toLowerCase().startsWith(query))) score += DOTTED_PREFIX_BONUS;
	if (symbol.unicodeName === query) score += EXACT_UNICODE_NAME_BONUS;
	if (terms.includes(parts[0])) score += BASE_NAME_BONUS;
	if (inNameOrder(matches)) score += NAME_ORDER_BONUS;
	return score;
}

/** how well a symbol answers the query, or null when it does not match at all */
function scoreSymbol(entry: IndexedSymbol, raw: string, query: string, terms: string[]): number | null {
	const literal = literalScore(entry.symbol, raw);
	const words = terms.length > 0 ? wordScore(entry, raw, query, terms) : 0;
	const best = Math.max(literal, words);
	if (best === 0) return null;
	return best - (entry.parts.length - 1) * PER_PART_PENALTY - (entry.symbol.module === 'emoji' ? EMOJI_PENALTY : 0);
}

/**
 * The symbols a query finds, best first. A query is matched by Typst name ("arrow.r.double"), by
 * meaning ("arrow right double", "not equal": every word must match a word of the name, of what the
 * name's short spellings stand for, or of the character's Unicode name), by shorthand ("=>") or by
 * the character itself. Recently used symbols rank higher among equals.
 */
export function searchTypstSymbols(symbols: readonly TypstSymbol[], query: string, recent: readonly string[] = []): TypstSymbol[] {
	const raw = query.trim();
	if (!raw) return [];
	const lower = raw.toLowerCase();
	// only words are split on dots: `...` and `.` are shorthands, not an empty name
	const terms = /[\p{L}\p{N}]/u.test(raw) ? lower.split(/[\s.]+/).filter((t) => /[\p{L}\p{N}]/u.test(t)) : [];
	const recentRank = new Map(recent.map((name, i) => [name, i]));
	const scored: { symbol: TypstSymbol; score: number; order: number }[] = [];
	indexOf(symbols).forEach((entry, order) => {
		const score = scoreSymbol(entry, raw, lower, terms);
		if (score === null) return;
		const rank = recentRank.get(entry.symbol.name);
		scored.push({ symbol: entry.symbol, score: score + (rank === undefined ? 0 : RECENT_BONUS - rank * 0.25), order });
	});
	scored.sort((a, b) => b.score - a.score || a.order - b.order);
	return scored.map((s) => s.symbol);
}
