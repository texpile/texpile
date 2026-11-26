// What the model changed in a sentence it rewrote, as spans of the sentence and what replaces each
const FORMULA = '$x$';

/** [from, to) of the sentence, `whole` when the change is the whole sentence */
export type RewriteChange = { from: number; to: number; replacement: string; whole: boolean };

type Token = { text: string; from: number; word: boolean; formula: boolean };

// past this share of its words changed, a sentence reads as one rephrasing
const MOST_CHANGED_WORDS = 0.3;
// changes this many words apart or closer are one change
const JOIN_WITHIN_WORDS = 1;

function tokensOf(text: string, segmenter: Intl.Segmenter): Token[] {
	const out: Token[] = [];
	let at = 0;
	function put(part: string, from: number) {
		for (const s of segmenter.segment(part)) out.push({ text: s.segment, from: from + s.index, word: !!s.isWordLike, formula: false });
	}
	for (let next = text.indexOf(FORMULA); next >= 0; next = text.indexOf(FORMULA, at)) {
		put(text.slice(at, next), at);
		out.push({ text: FORMULA, from: next, word: false, formula: true });
		at = next + FORMULA.length;
	}
	put(text.slice(at), at);
	return out;
}

function blank(t: Token): boolean {
	return /^\s+$/.test(t.text);
}

function keyOf(t: Token): string {
	return blank(t) ? ' ' : t.text;
}

type Run = { a: number; aTo: number; b: number; bTo: number };

/** the runs where the two token lists differ, from a longest common subsequence */
function differingRuns(was: Token[], now: Token[]): Run[] {
	const n = was.length;
	const m = now.length;
	const ka = was.map(keyOf);
	const kb = now.map(keyOf);
	const L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
	for (let i = n - 1; i >= 0; i--)
		for (let j = m - 1; j >= 0; j--) L[i][j] = ka[i] === kb[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
	const runs: Run[] = [];
	let i = 0;
	let j = 0;
	let open: Run | null = null;
	function close() {
		if (open) runs.push(open);
		open = null;
	}
	while (i < n || j < m) {
		if (i < n && j < m && ka[i] === kb[j]) {
			close();
			i++;
			j++;
			continue;
		}
		open ??= { a: i, aTo: i, b: j, bTo: j };
		if (j < m && (i === n || L[i][j + 1] >= L[i + 1][j])) open.bTo = ++j;
		else open.aTo = ++i;
	}
	close();
	return runs.filter((r) => !(was.slice(r.a, r.aTo).every(blank) && now.slice(r.b, r.bTo).every(blank)));
}

function wordsIn(tokens: Token[]): string {
	return tokens
		.filter((t) => t.word)
		.map((t) => t.text)
		.join(' ');
}

/** a phrase dropped in one place and put back in another is one change over both */
function joinMoves(runs: Run[], was: Token[], now: Token[]): Run[] {
	const out = runs.map((r) => ({ ...r }));
	function dropped(r: Run): string {
		return r.b === r.bTo ? wordsIn(was.slice(r.a, r.aTo)) : '';
	}
	function added(r: Run): string {
		return r.a === r.aTo ? wordsIn(now.slice(r.b, r.bTo)) : '';
	}
	for (let i = 0; i < out.length; i++)
		for (let j = i + 1; j < out.length; j++) {
			const [x, y] = [out[i], out[j]];
			const moved = (dropped(x) && dropped(x) === added(y)) || (added(x) && added(x) === dropped(y));
			if (!moved || was.slice(x.a, y.aTo).some((t) => t.formula)) continue;
			out.splice(i, j - i + 1, { a: x.a, aTo: y.aTo, b: x.b, bTo: y.bTo });
			j = i;
		}
	return out;
}

function joinNear(runs: Run[], was: Token[]): Run[] {
	const out: Run[] = [];
	for (const run of runs) {
		const last = out.at(-1);
		const between = last ? was.slice(last.aTo, run.a) : [];
		if (last && between.filter((t) => t.word).length <= JOIN_WITHIN_WORDS && !between.some((t) => t.formula)) {
			last.aTo = run.aTo;
			last.bTo = run.bTo;
		} else out.push({ ...run });
	}
	return out;
}

/** a change to punctuation or spacing alone takes the word beside it, so there is a word to underline */
function withWord(run: Run, was: Token[]): Run | null {
	const part = was.slice(run.a, run.aTo);
	if (part.some((t) => t.word)) return run;
	if (run.a > 0 && was[run.a - 1].word) return { ...run, a: run.a - 1, b: run.b - 1 };
	if (run.aTo < was.length && was[run.aTo].word) return { ...run, aTo: run.aTo + 1, bTo: run.bTo + 1 };
	return null;
}

function textOf(tokens: Token[]): string {
	return tokens.map((t) => t.text).join('');
}

function trimmedSpan(tokens: Token[], first: number, end: number): { from: number; to: number } | null {
	let from = first;
	let to = end;
	while (from < to && blank(tokens[from])) from++;
	while (to > from && blank(tokens[to - 1])) to--;
	if (from === to) return null;
	return { from: tokens[from].from, to: tokens[to - 1].from + tokens[to - 1].text.length };
}

function formulas(tokens: Token[]): number {
	return tokens.filter((t) => t.formula).length;
}

export function sentenceChanges(source: string, rewritten: string, language: string): RewriteChange[] {
	if (source === rewritten) return [];
	const segmenter = new Intl.Segmenter(language, { granularity: 'word' });
	const was = tokensOf(source, segmenter);
	const now = tokensOf(rewritten.trim(), segmenter);
	// a formula the model dropped or made up leaves nothing to compare by
	if (formulas(was) !== formulas(now)) return [];
	const runs = joinNear(joinMoves(differingRuns(was, now), was, now), was)
		.map((r) => withWord(r, was))
		.filter((r): r is Run => r !== null);
	if (!runs.length) return [];
	const words = was.filter((t) => t.word).length;
	const changedWords = runs.reduce((n, r) => n + was.slice(r.a, r.aTo).filter((t) => t.word).length, 0);
	if (words && changedWords / words > MOST_CHANGED_WORDS && !formulas(was)) {
		const span = trimmedSpan(was, 0, was.length);
		return span ? [{ ...span, replacement: rewritten.trim(), whole: true }] : [];
	}
	const out: RewriteChange[] = [];
	for (const r of runs) {
		if (was.slice(r.a, r.aTo).some((t) => t.formula) || now.slice(r.b, r.bTo).some((t) => t.formula)) continue;
		const span = trimmedSpan(was, r.a, r.aTo);
		if (!span) continue;
		const replacement = textOf(now.slice(r.b, r.bTo)).trim();
		// the spaces around a dropped word go with it
		const to = !replacement && source[span.to] === ' ' ? span.to + 1 : span.to;
		if (source.slice(span.from, to) !== replacement) out.push({ from: span.from, to, replacement, whole: false });
	}
	return out;
}

/** the share of the source's words a set of changes rewrites */
export function changedShare(source: string, changes: readonly RewriteChange[], language: string): number {
	const segmenter = new Intl.Segmenter(language, { granularity: 'word' });
	const words = [...segmenter.segment(source)].filter((s) => s.isWordLike);
	if (!words.length) return 0;
	const inside = words.filter((w) => changes.some((c) => w.index >= c.from && w.index < c.to));
	return inside.length / words.length;
}
