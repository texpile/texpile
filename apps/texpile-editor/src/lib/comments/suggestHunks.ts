// where two versions of a text differ, in whole words
import { diffArrays, diffLines } from 'diff';
import type { TextSpan } from './editGestures';

export type Hunk = { aFrom: number; aTo: number; bFrom: number; bTo: number };

export type SuggestionSpan = { from: number; to: number };

const SEGMENTER = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'word' }) : null;
const WORD = /[\p{L}\p{N}_]/u;
// what reads as more of the same word
const WORDLY = /^[\p{L}\p{N}]+$/u;
const REACH = 64;
const LIMITS = { maxEditLength: 4000, timeout: 250 };

function tokens(s: string): string[] {
	if (SEGMENTER) return Array.from(SEGMENTER.segment(s), (x) => x.segment);
	return s.match(/\s+|[\p{L}\p{N}_]+|./gsu) ?? [];
}

function isHighSurrogate(c: number) {
	return c >= 0xd800 && c <= 0xdbff;
}
function isLowSurrogate(c: number) {
	return c >= 0xdc00 && c <= 0xdfff;
}

export function commonEnds(before: string, after: string): { start: number; end: number } {
	const max = Math.min(before.length, after.length);
	let start = 0;
	while (start < max && before.charCodeAt(start) === after.charCodeAt(start)) start++;
	if (start > 0 && start < max && isHighSurrogate(before.charCodeAt(start - 1))) start--;
	let end = 0;
	while (end < max - start && before.charCodeAt(before.length - 1 - end) === after.charCodeAt(after.length - 1 - end)) end++;
	if (end > 0 && isLowSurrogate(before.charCodeAt(before.length - end))) end--;
	return { start, end };
}

function pushChanges(
	out: Hunk[],
	changes: { value: string[] | string; added: boolean; removed: boolean }[],
	aStart: number,
	bStart: number
) {
	let ai = aStart;
	let bi = bStart;
	for (const c of changes) {
		const len = typeof c.value === 'string' ? c.value.length : c.value.reduce((n, t) => n + t.length, 0);
		if (!c.added && !c.removed) {
			ai += len;
			bi += len;
			continue;
		}
		const last = out[out.length - 1];
		const h = last && last.aTo === ai && last.bTo === bi ? last : null;
		const cur = h ?? { aFrom: ai, aTo: ai, bFrom: bi, bTo: bi };
		if (c.removed) cur.aTo = ai += len;
		else cur.bTo = bi += len;
		if (!h) out.push(cur);
	}
}

function wordHunks(a: string, b: string, ai: number, bi: number): Hunk[] | null {
	if (!a || !b) return [{ aFrom: ai, aTo: ai + a.length, bFrom: bi, bTo: bi + b.length }];
	const changes = diffArrays(tokens(a), tokens(b), LIMITS);
	if (!changes) return null;
	const out: Hunk[] = [];
	pushChanges(out, changes, ai, bi);
	return out;
}

function pairedLines(la: string[], lb: string[], aStart: number, bStart: number): Hunk[] {
	const out: Hunk[] = [];
	let ai = aStart;
	let bi = bStart;
	for (let i = 0; i < la.length; i++) {
		const inner = commonEnds(la[i], lb[i]);
		const ia = la[i].slice(inner.start, la[i].length - inner.end);
		const ib = lb[i].slice(inner.start, lb[i].length - inner.end);
		if (ia || ib)
			out.push(
				...(wordHunks(ia, ib, ai + inner.start, bi + inner.start) ?? [
					{ aFrom: ai, aTo: ai + la[i].length, bFrom: bi, bTo: bi + lb[i].length }
				])
			);
		ai += la[i].length;
		bi += lb[i].length;
	}
	return out;
}

function lines(s: string): string[] {
	return s.split(/(?<=\n)/);
}

const WORD_DIFF_MAX = 40_000;

export function textHunks(before: string, after: string): Hunk[] {
	if (before === after) return [];
	const { start, end } = commonEnds(before, after);
	const a = before.slice(start, before.length - end);
	const b = after.slice(start, after.length - end);
	const whole = [{ aFrom: start, aTo: start + a.length, bFrom: start, bTo: start + b.length }];
	const words = a.length + b.length <= WORD_DIFF_MAX ? wordHunks(a, b, start, start) : null;
	if (words) return words;
	const la = lines(a);
	const lb = lines(b);
	if (la.length === lb.length) return pairedLines(la, lb, start, start);
	const changes = diffLines(a, b, LIMITS);
	if (!changes) return whole;
	const blocks: Hunk[] = [];
	pushChanges(blocks, changes, start, start);
	return blocks.flatMap((h) => {
		const ba = lines(before.slice(h.aFrom, h.aTo));
		const bb = lines(after.slice(h.bFrom, h.bTo));
		if (ba.length === bb.length) return pairedLines(ba, bb, h.aFrom, h.bFrom);
		return wordHunks(ba.join(''), bb.join(''), h.aFrom, h.bFrom) ?? [h];
	});
}

export function clearOfSuggestions(hunks: Hunk[], before: string, after: string, spans: SuggestionSpan[], typed: TextSpan[] = []): Hunk[] {
	if (spans.length === 0 && typed.length === 0) return hunks;
	function clear(a0: number, a1: number): boolean {
		return spans.every((s) =>
			s.from === s.to ? !(a0 < s.from && s.from < a1) : a0 === a1 ? !(s.from < a0 && a0 < s.to) : !(s.from < a1 && s.to > a0)
		);
	}
	const edges = new Set(spans.flatMap((s) => [s.from, s.to]));
	function covered(from: number, to: number) {
		return typed.reduce((n, g) => n + Math.max(0, Math.min(to, g.to) - Math.max(from, g.from)), 0);
	}
	let floor = 0;
	return hunks.map((h) => {
		const insertion = h.aFrom === h.aTo && h.bTo > h.bFrom;
		const deletion = h.bFrom === h.bTo && h.aTo > h.aFrom;
		let out = h;
		const shifts: number[] = [];
		for (let k = 0; insertion && typed.length && h.aFrom - k >= floor && h.bFrom - k >= 0; k++) {
			if (k > 0 && after.charCodeAt(h.bFrom - k) !== after.charCodeAt(h.bTo - k)) break;
			if (!isLowSurrogate(after.charCodeAt(h.bFrom - k)) && clear(h.aFrom - k, h.aFrom - k)) shifts.push(k);
		}
		const best = Math.max(0, ...shifts.map((k) => covered(h.bFrom - k, h.bTo - k)));
		if (best > 0) {
			const k = shifts
				.filter((k) => covered(h.bFrom - k, h.bTo - k) === best)
				.sort((x, y) => Number(edges.has(h.aFrom - y)) - Number(edges.has(h.aFrom - x)) || y - x)[0];
			out = { aFrom: h.aFrom - k, aTo: h.aTo - k, bFrom: h.bFrom - k, bTo: h.bTo - k };
		} else if (deletion && clear(h.aFrom, h.aTo) && !edges.has(h.aFrom) && !edges.has(h.aTo)) {
			// the same letters taken out a little further left meet a suggestion: they go with it
			for (let k = 1; h.aFrom - k >= floor && before.charCodeAt(h.aFrom - k) === before.charCodeAt(h.aTo - k); k++) {
				if (isLowSurrogate(before.charCodeAt(h.aFrom - k))) continue;
				if ((edges.has(h.aFrom - k) || edges.has(h.aTo - k)) && clear(h.aFrom - k, h.aTo - k)) {
					out = { aFrom: h.aFrom - k, aTo: h.aTo - k, bFrom: h.bFrom - k, bTo: h.bTo - k };
					break;
				}
			}
		} else if ((insertion || deletion) && !clear(h.aFrom, h.aTo)) {
			const text = insertion ? after : before;
			const from = insertion ? h.bFrom : h.aFrom;
			const to = insertion ? h.bTo : h.aTo;
			for (let k = 1; h.aFrom - k >= floor && from - k >= 0 && text.charCodeAt(from - k) === text.charCodeAt(to - k); k++) {
				const a0 = h.aFrom - k;
				const a1 = insertion ? a0 : h.aTo - k;
				if (isLowSurrogate(text.charCodeAt(from - k))) continue;
				if (clear(a0, a1)) {
					out = { aFrom: a0, aTo: a1, bFrom: h.bFrom - k, bTo: h.bTo - k };
					break;
				}
			}
		}
		floor = out.aTo;
		return out;
	});
}

type WhitespaceChange = { at: number; cut: number; spaced: boolean };

export function whitespaceChange(before: string, h: Hunk, inserted: string): WhitespaceChange | null {
	const removed = before.slice(h.aFrom, h.aTo);
	if (removed.replace(/\s+/g, ' ').trim() !== inserted.replace(/\s+/g, ' ').trim()) return null;
	let p = 0;
	while (p < removed.length && p < inserted.length && removed[p] === inserted[p]) p++;
	let e = 0;
	while (e < removed.length - p && e < inserted.length - p && removed[removed.length - 1 - e] === inserted[inserted.length - 1 - e]) e++;
	const cut = removed.slice(p, removed.length - e);
	const put = inserted.slice(p, inserted.length - e);
	return { at: h.aFrom + p, cut: cut.length, spaced: /\s/.test(cut) && /\s/.test(put) };
}

// a list item's marker in markdown and typst, and the spaces before it: how deep the item sits
const ITEM = /^([ \t]*)([-+*]|\d+[.)]|\/)(?=[ \t])/;

// a paragraph right after a list: its indent says whether it belongs to the item
function opensAfterList(text: string, at: number): boolean {
	let j = at - 2;
	while (j >= 0 && /[ \t\r]/.test(text[j])) j--;
	if (j < 0 || text[j] !== '\n') return false;
	while (j >= 0 && /\s/.test(text[j])) j--;
	if (j < 0) return false;
	const line = text.slice(text.lastIndexOf('\n', j) + 1, j + 1);
	return ITEM.test(line) || /^[ \t]/.test(line);
}

function itemDepths(text: string, from: number, to: number): string {
	const start = text.lastIndexOf('\n', from - 1) + 1;
	const end = text.indexOf('\n', to);
	let at = start;
	return text
		.slice(start, end < 0 ? text.length : end)
		.split('\n')
		.flatMap((line) => {
			const lineAt = at;
			at += line.length + 1;
			const m = ITEM.exec(line);
			if (m) return [`${m[1].replace(/\t/g, '    ').length}${m[2]}`];
			return /\S/.test(line) && opensAfterList(text, lineAt) ? [`${/^[ \t]*/.exec(line)![0].replace(/\t/g, '    ').length}`] : [];
		})
		.join(' ');
}

function movesItem(before: string, after: string, h: Hunk): boolean {
	return itemDepths(before, h.aFrom, h.aTo) !== itemDepths(after, h.bFrom, h.bTo);
}

export function paragraphShape(text: string): string {
	return text
		.replace(/(\n[ \t\r]*){2,}/g, '\n\n')
		.split(/\n[ \t\r]*\n/)
		.map((p) => p.replace(/\s+/g, ' ').trim())
		.join('¶');
}

function spaceAround(text: string, from: number, to: number): string {
	let start = from;
	let end = to;
	while (start > 0 && /\s/.test(text[start - 1])) start--;
	while (end < text.length && /\s/.test(text[end])) end++;
	return text.slice(start, end);
}

// two spaces ending a line, which markdown reads as a line break
const LINE_BREAK = /^[^\n]*[ \t]{2}\r?\n[^\n]*$/;

/** `lists`: the spaces before a list marker are the item's depth (markdown, typst) */
export function neutral(before: string, after: string, h: Hunk, lists = false): boolean {
	const c = whitespaceChange(before, h, after.slice(h.bFrom, h.bTo));
	if (!c) return false;
	if (paragraphShape(spaceAround(before, h.aFrom, h.aTo)) !== paragraphShape(spaceAround(after, h.bFrom, h.bTo))) return false;
	if (lists && movesItem(before, after, h)) return false;
	if (lists && LINE_BREAK.test(spaceAround(before, h.aFrom, h.aTo)) !== LINE_BREAK.test(spaceAround(after, h.bFrom, h.bTo))) return false;
	return c.spaced || /\s/.test(before[c.at - 1] ?? ' ') || /\s/.test(before[c.at + c.cut] ?? ' ');
}

function wordAround(text: string, pos: number): [number, number] | null {
	if (pos <= 0 || pos >= text.length) return null;
	const start = Math.max(0, pos - REACH);
	const slice = text.slice(start, Math.min(text.length, pos + REACH));
	if (SEGMENTER) {
		for (const seg of SEGMENTER.segment(slice)) {
			const from = start + seg.index;
			const to = from + seg.segment.length;
			if (from < pos && pos < to) return seg.isWordLike ? [from, to] : null;
			if (from >= pos) break;
		}
		return null;
	}
	if (!WORD.test(text[pos - 1]) || !WORD.test(text[pos])) return null;
	let from = pos;
	while (from > start && WORD.test(text[from - 1])) from--;
	let to = pos;
	while (to < start + slice.length && WORD.test(text[to])) to++;
	return [from, to];
}

export function joinGestures(hunks: Hunk[], before: string, after: string, gestures: TextSpan[], exact = false, lists = false): Hunk[] {
	if (gestures.length === 0) return hunks;
	const out: Hunk[] = [];
	let open: { hunk: Hunk; gesture: TextSpan } | null = null;
	for (const h of hunks) {
		const real = exact || !neutral(before, after, h, lists);
		const gesture = real ? gestures.find((g) => g.from <= h.bTo && h.bFrom <= g.to) : undefined;
		if (open && gesture && gesture === open.gesture) {
			while (out[out.length - 1] !== open.hunk) out.pop();
			open.hunk.aTo = h.aTo;
			open.hunk.bTo = h.bTo;
			continue;
		}
		const copy = { ...h };
		out.push(copy);
		if (gesture) open = { hunk: copy, gesture };
		else if (real) open = null;
	}
	return out;
}

export function snapToWords(hunks: Hunk[], before: string, after: string, spans: SuggestionSpan[], exact = false, lists = false): Hunk[] {
	function touches(from: number, to: number) {
		return spans.some((s) => s.from <= to && s.to >= from);
	}
	const snapped = hunks.map((h) => {
		if (touches(h.aFrom, h.aTo) || (!exact && neutral(before, after, h, lists))) return h;
		// an item moved a level reads as a change to the item, not as spaces nobody can see
		if (lists && whitespaceChange(before, h, after.slice(h.bFrom, h.bTo)) && movesItem(before, after, h)) {
			const end = before.indexOf('\n', h.aTo);
			const tail = (end < 0 ? before.length : end) - h.aTo;
			return { ...h, aTo: h.aTo + tail, bTo: h.bTo + tail };
		}
		// a change that only adds or only takes away stands where it was made, the way an addition already does at the end
		// of a word. Letters and digits only: a space or a mark inside a word changes which words are there, and that
		// reads better as the whole word
		const oneWay = h.aFrom === h.aTo ? after.slice(h.bFrom, h.bTo) : h.bFrom === h.bTo ? before.slice(h.aFrom, h.aTo) : '';
		if (WORDLY.test(oneWay)) return h;
		// and so does a cut across lines: grown to whole words at its ends, what is left of them read as typed
		// (a cut from inside one heading to inside the next showed the joined word as new)
		if (h.bFrom === h.bTo && oneWay.includes('\n')) return h;
		const left = wordAround(before, h.aFrom);
		const right = wordAround(before, h.aTo);
		const grow = left && !touches(left[0], h.aFrom) ? h.aFrom - left[0] : 0;
		const tail = right && !touches(h.aTo, right[1]) ? right[1] - h.aTo : 0;
		return { aFrom: h.aFrom - grow, aTo: h.aTo + tail, bFrom: h.bFrom - grow, bTo: h.bTo + tail };
	});
	const out: Hunk[] = [];
	for (const h of snapped) {
		const last = out[out.length - 1];
		const spaced = last && /^\s*$/.test(before.slice(last.aTo, h.aFrom)) && !touches(last.aFrom, last.aTo) && !touches(h.aFrom, h.aTo);
		if (last && (h.aFrom <= last.aTo || spaced)) {
			last.aTo = Math.max(last.aTo, h.aTo);
			last.bTo = last.aTo + (h.bTo - h.aTo);
		} else out.push({ ...h });
	}
	return out;
}
