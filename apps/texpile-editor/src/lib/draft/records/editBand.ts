/* eslint-disable @typescript-eslint/no-explicit-any */
// Where an edit shows: the first word the shipped pages change, read across pages, because typing at a paragraph's end
// can re-break its lines on the page before. Source stamps are no guide: TeX stamps a line with the line it read up to.
import type { EditBand } from '../draftViewport.svelte';

type PageLine = { tokens: string[]; text: string; hyphenEnd: boolean; top: number; bottom: number; left: number; right: number };
export type ShippedPage = { n: number; before: PageLine[]; after: PageLine[]; head: number; tail: number };
type Token = { tok: string; hyphen: boolean; page: number; line: number };

// '-', T1's hyphen slot, soft hyphen, U+2010
const HYPHENS = new Set([45, 127, 173, 0x2010]);

function pageLines(records: any[]): PageLine[] {
	const fonts = new Map(records.filter((r) => r.t === 'font').map((r) => [r.id, r]));
	const lines: PageLine[] = [];
	let line: PageLine | null = null;
	let prev: any = null;
	for (const r of records) {
		// hb: a box on the page's list, such as a table row; its words are a line of their own
		if (r.t === 'pl' || r.t === 'hb') {
			line = { tokens: [], text: '', hyphenEnd: false, top: r.y - r.h, bottom: r.y + (r.d ?? 0), left: r.x, right: r.x + r.w };
			lines.push(line);
			prev = null;
		} else if (line && r.t === 'g') {
			const font = fonts.get(r.f);
			// a word space, by the gap draftWordAt reads as one
			if (prev && r.x - (prev.x + (prev.w ?? 0)) > Math.max(0.9, 0.13 * (font?.size || 10))) line.tokens.push(' ');
			line.tokens.push(`${r.c}:${font?.name}@${font?.size}`);
			line.hyphenEnd = HYPHENS.has(r.c);
			prev = r;
		}
	}
	for (const l of lines) l.text = l.tokens.join('|');
	return lines;
}

/** a page a teleport shipped, with the run of lines that differ from the page shown before */
export function shippedPage(n: number, before: any[], after: any[]): ShippedPage {
	const a = pageLines(before);
	const b = pageLines(after);
	let head = 0;
	while (head < a.length && head < b.length && a[head].text === b[head].text) head++;
	let tail = 0;
	while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail].text === b[b.length - 1 - tail].text) tail++;
	return { n, before: a, after: b, head, tail };
}

function changedTokens(pages: ShippedPage[], side: 'before' | 'after'): Token[] {
	const out: Token[] = [];
	pages.forEach((p, page) => {
		const lines = p[side];
		for (let line = p.head; line < lines.length - p.tail; line++) {
			const l = lines[line];
			l.tokens.forEach((tok, k) => out.push({ tok, hyphen: l.hyphenEnd && k === l.tokens.length - 1, page, line }));
			out.push({ tok: '\n', hyphen: false, page, line });
		}
	});
	return out;
}

// tokens a line broken at a hyphen holds that the same words unbroken do not: the hyphen TeX added, or the break
function hyphenBreak(s: Token[], k: number): number {
	if (s[k].hyphen && s[k + 1]?.tok === '\n') return 2;
	return s[k].tok === '\n' && s[k - 1]?.hyphen ? 1 : 0;
}

function firstDifference(b: Token[], a: Token[]): { i: number; j: number } {
	let i = 0;
	let j = 0;
	while (i < b.length && j < a.length) {
		const x = b[i].tok;
		const y = a[j].tok;
		if (x === y || (x === '\n' && y === ' ') || (x === ' ' && y === '\n')) {
			i++;
			j++;
		} else if (hyphenBreak(b, i)) i += hyphenBreak(b, i);
		else if (hyphenBreak(a, j)) j += hyphenBreak(a, j);
		else break;
	}
	return { i, j };
}

function bandOf(page: ShippedPage, from: number, to: number): EditBand {
	const lines = page.after.slice(from, to);
	return {
		page: page.n,
		top: Math.min(...lines.map((l) => l.top)),
		bottom: Math.max(...lines.map((l) => l.bottom)),
		colL: Math.min(...lines.map((l) => l.left)),
		colR: Math.max(...lines.map((l) => l.right))
	};
}

// null until the run ended while the difference may be words flowing on to a page not shipped yet
export function editBand(pages: ShippedPage[], ended: boolean): EditBand | null {
	const b = changedTokens(pages, 'before');
	const a = changedTokens(pages, 'after');
	const { i, j } = firstDifference(b, a);
	if (!ended && (i === b.length || j === a.length)) return null;
	const at = i === b.length && j === a.length ? undefined : a[Math.min(j, a.length - 1)];
	if (at) return bandOf(pages[at.page], at.line, pages[at.page].after.length - pages[at.page].tail);
	const page = pages.find((p) => p.after.length - p.tail > p.head);
	return page ? bandOf(page, page.head, page.after.length - page.tail) : null;
}
