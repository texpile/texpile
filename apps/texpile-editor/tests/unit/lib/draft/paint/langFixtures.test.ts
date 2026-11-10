// Contract tests over REAL engine output for a spread of scripts and font loaders.
// See tests/fixtures/lang/README.md; regenerate with scripts/capture-lang-fixtures.mjs.
//
// Hand-written records could not have caught the bug these exist for -- it was in what
// luaotfload reports about a font, not in anything we would have thought to write down.
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as opentype from 'opentype.js';
import { parseRecords, pageIsRtl } from '$lib/draft/records/pageRecords';
import { buildDrawList } from '$lib/draft/paint/renderCore';
import { sfntFromTtc } from '$lib/draft/paint/ttc';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../../fixtures/lang');

/* eslint-disable @typescript-eslint/no-explicit-any */
type Case = { name: string; records: any[]; dropped: number; page: any; fonts: any[] };

const CASES: Case[] = fs
	.readdirSync(dir)
	.filter((f) => f.endsWith('.jsonl'))
	.map((f) => {
		const name = f.replace(/\.jsonl$/, '');
		const { records, dropped } = parseRecords(fs.readFileSync(path.join(dir, f), 'utf8'));
		const page = JSON.parse(fs.readFileSync(path.join(dir, `${name}.pages.json`), 'utf8')).pages[0];
		return { name, records, dropped, page, fonts: records.filter((r) => r.t === 'font') };
	});

// which cases contain a right-to-left run, and the Unicode block it is written in. Stated here
// rather than read back off the fixture, so a capture that quietly stopped producing the run
// fails instead of agreeing with itself.
const RTL: Record<string, [number, number]> = {
	'hebrew-rtl': [0x590, 0x5ff],
	'arabic-rtl': [0x600, 0x6ff] // shaped forms land in the Presentation Forms blocks, see below
};
const isRtlScript = (c: number, [lo, hi]: [number, number]) =>
	(c >= lo && c <= hi) || (c >= 0xfb1d && c <= 0xfdff) || (c >= 0xfe70 && c <= 0xfeff);

it('the fixture set was captured', () => {
	expect(CASES.map((c) => c.name).sort()).toEqual(['arabic-rtl', 'cjk-ttc', 'cm-baseline', 'fontspec-space', 'greek', 'hebrew-rtl']);
});

describe.each(CASES)('$name', ({ name, records, dropped, page, fonts }) => {
	it('every record parses', () => {
		expect(dropped).toBe(0);
		expect(records.length).toBeGreaterThan(0);
	});

	it('declares a font for every glyph it draws', () => {
		const ids = new Set(fonts.map((f) => f.id));
		for (const g of records.filter((r) => r.t === 'g')) expect(ids).toContain(g.f);
	});

	it('reports font paths the renderer can actually fetch', () => {
		expect(fonts.length).toBeGreaterThan(0);
		for (const f of fonts) {
			// "harfloaded:" is luaotfload's loader tag, not part of the path. Passing it through
			// made every fetch 404, so a Hebrew page loaded no font and drew nothing at all.
			expect(f.file).not.toMatch(/^harfloaded:/);
			expect(f.file).toMatch(/\.(otf|ttf|ttc|otc)$/i);
			// a collection has to say WHICH face, or the wrong one gets parsed
			if (/\.(ttc|otc)$/i.test(f.file)) expect(f.sub).toBeGreaterThanOrEqual(1);
		}
	});

	it('carries a glyph index for every HarfBuzz-shaped glyph', () => {
		// harf substitutes glyphs, so a shaped run's char values stop standing for the codepoints
		// that produced them (Arabic comes back as presentation forms). Only the index resolves.
		const harf = new Set(fonts.filter((f) => /mode=harf/.test(f.name)).map((f) => f.id));
		if (!harf.size) return expect(records.some((r) => r.t === 'g')).toBe(true);
		for (const g of records.filter((r) => r.t === 'g' && harf.has(r.f))) expect(g.gi).toBeGreaterThan(0);
	});

	it('is not refused for direction', () => {
		// Right-to-left runs are LAID OUT now rather than handed to the PDF raster, so no ordinary
		// page should come back uncertified for direction -- including the Hebrew and Arabic ones,
		// which is the whole point. `dir` survives only for what still cannot be drawn: the LTL and
		// RTT vertical writing modes, and a direction run with no closing marker.
		expect(pageIsRtl(page.unc)).toBe(false);
	});

	const block = RTL[name];
	it.skipIf(!block)('places the right-to-left run in visual order', () => {
		// The walker emits in LOGICAL order (the order the node list is in), so a correctly laid
		// out run has each successive letter to the LEFT of the one before it. If the reversal
		// were missing these would ascend instead, which is exactly what the bug looked like.
		const run = records.filter((r) => r.t === 'g' && isRtlScript(r.c, block));
		expect(run.length).toBeGreaterThan(2);
		for (let i = 1; i < run.length; i++) expect(run[i].x).toBeLessThan(run[i - 1].x);

		// and the letters tile the run exactly: each one's left edge meets the previous one's,
		// so no gap opens up and nothing overlaps
		for (let i = 1; i < run.length; i++) expect(run[i].x + run[i].w).toBeCloseTo(run[i - 1].x, 3);
	});

	it.skipIf(!block)('keeps the surrounding left-to-right text clear of the run', () => {
		// Reversing the run must not disturb what brackets it. The invariant is containment: the
		// run occupies one span, and no left-to-right glyph may land inside that span. Not
		// adjacency -- Hebrew here is followed immediately by a period, Arabic by an interword
		// space, and both are correct.
		const run = records.filter((r) => r.t === 'g' && isRtlScript(r.c, block));
		const left = Math.min(...run.map((r) => r.x));
		const right = Math.max(...run.map((r) => r.x + r.w));
		const sameLine = records.filter((r) => r.t === 'g' && !isRtlScript(r.c, block) && Math.abs(r.y - run[0].y) < 0.001);
		expect(sameLine.length).toBeGreaterThan(0);
		for (const g of sameLine) expect(g.x + g.w <= left + 0.001 || g.x >= right - 0.001).toBe(true);
	});
});

// The end-to-end check: parse the fonts the engine named and confirm every glyph resolves to
// real outlines. Font paths are absolute and machine-specific, so this runs only where the
// capture was made -- elsewhere the shape assertions above still hold.
describe.each(CASES)('$name outlines', ({ fonts, records }) => {
	const present = fonts.every((f) => fs.existsSync(f.file));
	it.skipIf(!present)('draws every glyph, none falling back to .notdef', () => {
		const parsed = new Map<number, any>();
		for (const f of fonts) {
			const buf = fs.readFileSync(f.file);
			const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
			parsed.set(f.id, { ot: opentype.parse(sfntFromTtc(ab, (f.sub || 1) - 1)), size: f.size });
		}
		const { stats } = buildDrawList(records, (id) => parsed.get(id) ?? null, 1);
		expect(stats.glyphsDrawn).toBe(records.filter((r) => r.t === 'g').length);
		expect(stats.notdef).toBe(0);
	});
});
