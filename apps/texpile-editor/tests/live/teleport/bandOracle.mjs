// The edit band oracle (--band): the renderer's band code run on the pages each teleport shipped, as draftSession runs
// it, and a check that the band holds the line where the edit's words stand on the page: the words just before its
// first change followed by the first words it wrote (for a deletion, the words now in its place). An off band goes to
// the dump folder as band-<n>.json for renderBand.mjs in texpile-tools.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { diffLines } from 'diff';

const here = path.dirname(fileURLToPath(import.meta.url));
const recordsDir = path.resolve(here, '../../../src/lib/draft/records');

function bundle(tmp) {
	const out = path.join(tmp, 'editBand.cjs');
	buildSync({
		stdin: { contents: `export * from './editBand';`, resolveDir: recordsDir, loader: 'ts' },
		outfile: out,
		bundle: true,
		platform: 'node',
		format: 'cjs',
		target: 'node22',
		logLevel: 'silent'
	});
	return createRequire(import.meta.url)(out);
}

const parse = (raw) =>
	(raw ?? '')
		.split('\n')
		.filter(Boolean)
		.map((l) => JSON.parse(l));

// OT1 and T1 ligature slots, and Unicode's
const LIGATURES = { 11: 'ff', 12: 'fi', 13: 'fl', 14: 'ffi', 15: 'ffl', 27: 'ff', 28: 'fi', 29: 'fl', 30: 'ffi', 31: 'ffl' };
const HYPHENS = new Set([45, 127, 173, 0x2010]);
function charOf(c) {
	if (LIGATURES[c]) return LIGATURES[c];
	if (c >= 0xfb00 && c <= 0xfb04) return ['ff', 'fi', 'fl', 'ffi', 'ffl'][c - 0xfb00];
	return c >= 32 ? String.fromCodePoint(c) : '';
}

/** the paragraph lines of a page with their text, as the band code splits them */
export function textLines(records) {
	const fonts = new Map(records.filter((r) => r.t === 'font').map((r) => [r.id, r]));
	const lines = [];
	let line = null;
	let prev = null;
	for (const r of records) {
		if (r.t === 'pl' || r.t === 'hb') {
			line = { text: '', hyphenEnd: false, top: r.y - r.h, bottom: r.y + (r.d ?? 0), left: r.x, right: r.x + r.w };
			lines.push(line);
			prev = null;
		} else if (line && r.t === 'g') {
			const size = fonts.get(r.f)?.size || 10;
			if (prev && r.x - (prev.x + (prev.w ?? 0)) > Math.max(0.9, 0.13 * size)) line.text += ' ';
			line.text += charOf(r.c).toLowerCase();
			line.hyphenEnd = HYPHENS.has(r.c);
			prev = r;
		}
	}
	return lines;
}

// the page's words in reading order with their lines; a word broken at a hyphen counts once, on its first line
function pageWords(lines) {
	const out = [];
	let carry = null;
	lines.forEach((l, k) => {
		(l.text.match(/[a-z]+/g) ?? []).forEach((w, i) => {
			if (carry && i === 0) carry.w += w;
			else out.push({ w, line: k });
		});
		carry = l.hyphenEnd && out.length ? out.at(-1) : null;
	});
	return out.filter((x) => x.w.length > 1);
}

const MATH_ENVS = 'equation|align|alignat|eqnarray|gather|multline|displaymath|math|tabular|tabularx|array';
const blank = (m) => m.replace(/[^\n]/g, ' ');
// the source with what prints no prose blanked out, offsets kept: comments, math, tables, references, command names
function prose(s) {
	return s
		.replace(/(^|[^\\])(%[^\n]*)/g, (m, a, b) => a + blank(b))
		.replace(new RegExp(`\\\\begin\\{(${MATH_ENVS})\\*?\\}[\\s\\S]*?\\\\end\\{\\1\\*?\\}`, 'g'), blank)
		.replace(/\$\$[\s\S]*?\$\$|\$[^$]*\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)/g, blank)
		.replace(/\\(begin|end)\{[^}]*\}(\[[^\]]*\])?/g, blank)
		.replace(
			/\\(label|ref|eqref|cref|Cref|autoref|pageref|cite[a-zA-Z]*|input|include|includegraphics|url|href|bibliography[a-z]*|usepackage)\*?(\[[^\]]*\])*\{[^}]*\}/g,
			blank
		)
		.replace(/\\[A-Za-z@]+/g, blank);
}
// words of two letters or more: math letters print as single glyphs
function wordsAt(s) {
	return [...prose(s).matchAll(/[A-Za-z]{2,}/g)].map((m) => ({ w: m[0].toLowerCase(), at: m.index }));
}

/** where each change is in the source: the prose words before it and the first ones there after it */
export function changesOf(prev, next) {
	const out = [];
	const nextWords = wordsAt(next);
	const prevWords = wordsAt(prev);
	const within = (words, a, b) => words.filter((x) => x.at >= a && x.at < b).length;
	let at = 0;
	let atPrev = 0;
	let removed = '';
	let added = '';
	const flush = () => {
		if (!removed && !added) return;
		let k = 0;
		while (k < removed.length && k < added.length && removed[k] === added[k]) k++;
		let p = at - added.length + k;
		while (p > 0 && /[A-Za-z]/.test(next[p]) && /[A-Za-z]/.test(next[p - 1])) p--;
		const wrote = within(nextWords, p, at);
		out.push({
			before: nextWords
				.filter((x) => x.at < p)
				.slice(-3)
				.map((x) => x.w),
			after: nextWords
				.filter((x) => x.at >= p)
				.slice(0, 3)
				.map((x) => x.w),
			deletion: !wrote,
			// math, tables and other content outside paragraph lines
			prose: wrote > 0 || within(prevWords, atPrev - removed.length + k, atPrev) > 0,
			line: next.slice(0, p).split('\n').length,
			was: removed.slice(k, k + 120),
			now: added.slice(k, k + 120)
		});
		removed = added = '';
	};
	for (const part of diffLines(prev, next)) {
		if (part.removed) {
			removed += part.value;
			atPrev += part.value.length;
		} else if (part.added) {
			added += part.value;
			at += part.value.length;
		} else {
			flush();
			at += part.value.length;
			atPrev += part.value.length;
		}
	}
	flush();
	return out;
}

// the lines where the change's words stand together: the line of the first word after the change
function placesOf(words, change) {
	// the words before alone match too much
	const tries = [
		[change.before, change.after],
		[[], change.after]
	].filter(([b, a]) => a.length && b.length + a.length >= 2);
	for (const [b, a] of tries) {
		const want = [...b, ...a];
		const found = [];
		for (let i = 0; i + want.length <= words.length; i++)
			if (want.every((w, k) => words[i + k].w === w)) found.push(words[i + Math.min(b.length, want.length - 1)].line);
		if (found.length) return found;
	}
	return [];
}

export class BandOracle {
	stats = { shown: 0, band: 0, ok: 0, offLine: 0, offPage: 0, none: 0, noneSuperseded: 0, outside: 0, deleteLineEnd: 0, unplaced: 0 };
	shipped = { seq: -1, pages: [], raws: [], shown: false };
	seq = 0;
	sends = new Map();

	constructor(tmp, texts, dumpDir) {
		this.B = bundle(tmp);
		this.compiled(texts);
		this.dumpDir = dumpDir;
	}

	// the text each page on screen was typeset from, per file
	compiled(texts) {
		this.base = new Map(texts);
		this.pageTexts = new Map();
	}

	/** before the gate sends: the edit's number */
	start(file, text) {
		const seq = ++this.seq;
		this.sends.set(seq, { file, text, under: new Map(), band: null, run: null });
		return seq;
	}

	/** a page of run `seq` lands, with what the screen held there before (draftSession.applyPage) */
	page(seq, p, beforeRaw) {
		const s = this.sends.get(seq);
		const under = this.pageTexts.get(p.n) ?? this.base;
		// rapid edits leave pages of several texts on screen: each page is judged against its own
		s.under.set(p.n, under.get(s.file) ?? '');
		this.pageTexts.set(p.n, new Map(under).set(s.file, s.text));
		if (seq !== this.shipped.seq) this.shipped = { seq, pages: [], raws: [], shown: false };
		s.run = this.shipped;
		this.shipped.pages.push(this.B.shippedPage(p.n, parse(beforeRaw), parse(p.records)));
		this.shipped.raws.push({ n: p.n, records: p.records });
		this.show(seq, false);
	}

	show(seq, ended) {
		if (seq !== this.shipped.seq || this.shipped.shown) return;
		const band = this.B.editBand(this.shipped.pages, ended);
		if (!band) return;
		this.shipped.shown = true;
		this.sends.get(seq).band = band;
	}

	/** run `seq` landed: draftSession.landed shows the band now if a page ended the run's difference */
	landed(seq, res, what) {
		if (!res.ok) return;
		this.show(seq, true);
		const s = this.sends.get(seq);
		this.stats.shown++;
		const verdict = this.judge(s);
		this.stats[verdict.kind]++;
		if (s.band) this.stats.band++;
		if (['offLine', 'offPage', 'deleteLineEnd'].includes(verdict.kind) && this.dumpDir) {
			fs.mkdirSync(this.dumpDir, { recursive: true });
			fs.writeFileSync(
				path.join(this.dumpDir, `band-${seq}.json`),
				JSON.stringify({ what, file: s.file, ...verdict, band: s.band, pages: s.run.raws })
			);
		}
		if (verdict.kind !== 'ok')
			console.error(
				`   band ${verdict.kind} for ${what}: ${JSON.stringify(verdict.src ?? '')}${verdict.at ? ' band at ' + JSON.stringify(verdict.at) : ''}`
			);
		return verdict;
	}

	judge(s) {
		// a later run's pages came first: draftSession keeps the newest run's pages only
		if (!s.band) return { kind: s.run && this.shipped !== s.run ? 'noneSuperseded' : 'none' };
		const band = s.band;
		let bandFirst = -1;
		let inBand = false;
		const hits = [];
		const changes = new Map();
		for (const { n, records } of s.run.raws) {
			const was = s.under.get(n);
			if (!changes.has(was)) changes.set(was, changesOf(was, s.text));
			const lines = textLines(parse(records));
			const words = pageWords(lines);
			const inside = (l) =>
				n === band.page &&
				l.top >= band.top - 0.01 &&
				l.bottom <= band.bottom + 0.01 &&
				l.left >= band.colL - 0.01 &&
				l.right <= band.colR + 0.01;
			if (n === band.page) bandFirst = lines.findIndex(inside);
			for (const change of changes.get(was).filter((c) => c.prose))
				for (const k of placesOf(words, change)) {
					const l = lines[k];
					if (inside(l)) inBand = true;
					hits.push({ page: n, line: k, top: l.top, bottom: l.bottom, left: l.left, right: l.right, change });
				}
		}
		if (inBand) return { kind: 'ok' };
		const all = [...changes.values()].flat();
		const first = all.find((c) => c.prose) ?? all[0];
		const src = first && { line: first.line, was: first.was, now: first.now, words: [...first.before, '|', ...first.after] };
		if (!all.some((c) => c.prose)) return { kind: 'outside', src };
		// prose the oracle cannot find on the shipped pages
		if (!hits.length) return { kind: 'unplaced', src };
		// a change before every placed one, which the band may rightly hold: math, a table, a citation
		const placed = new Set(hits.map((h) => h.change));
		const firstPlaced = Math.min(...hits.map((h) => h.change.line));
		const earlier = all.filter((c) => !placed.has(c) && c.line < firstPlaced);
		if (earlier.some((c) => !c.prose)) return { kind: 'outside', src };
		if (earlier.length) return { kind: 'unplaced', src };
		const onPage = hits.filter((h) => h.page === band.page);
		const at = { page: band.page, line: bandFirst };
		if (onPage.some((h) => h.change.deletion && h.line === bandFirst - 1)) return { kind: 'deleteLineEnd', src, hits, at };
		return { kind: onPage.length ? 'offLine' : 'offPage', src, hits, at };
	}
}
