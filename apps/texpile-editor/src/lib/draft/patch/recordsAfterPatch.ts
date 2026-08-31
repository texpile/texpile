/* eslint-disable @typescript-eslint/no-explicit-any -- page records are schemaless engine JSON */
// The page's records AFTER a patch, derived from the same three pieces the painter composes:
// what the patch left alone, what it shifted, and the band the daemon typeset. Pixels have
// always been incremental; records were not, and a full recompile existed mainly to
// regenerate them. When the patch is the engine's own answer end to end there is nothing for
// that recompile to discover -- every number is already in hand.
//
// Composed in the painter's own terms deliberately (draftSession.paintPage): if the two ever
// disagree, the screen and the record store describe different documents, and every later
// locate reads the store.
import { splitPatchRecords } from '../draftPaint';
import { flowDyAt } from './glueShift';
import type { Patch } from './patch.types';

/**
 * ONE patch, on ONE page, that carried nothing away (no clip, no spill). Returns null when the
 * patch is anything else -- the caller then keeps the recompile rather than guessing.
 *
 * Vertical-list ORDER is preserved: buildPageSkeleton reads records by index range, so a
 * correctly-positioned record set in the wrong order is still a broken one.
 */
export function recordsAfterPatch(
	records: any[],
	patch: Patch,
	contentBottom: number,
	bandStamp: { s?: number; sf?: number }
): any[] | null {
	if (patch.clipBottom !== undefined) return null;
	const { unchanged, shifted, raised } = splitPatchRecords(records, [patch], contentBottom);
	const keep = new Set<any>(unchanged);
	const move = new Set<any>(shifted[0]);
	const lift = new Set<any>(raised[0]);

	const out: any[] = [];
	let placed = false;
	for (const r of records) {
		// a font record is shared by both partitions; it is positionless, so it stays once
		if (r.t === 'font') {
			out.push(r);
			continue;
		}
		if (keep.has(r)) {
			out.push(r);
			continue;
		}
		if (move.has(r)) {
			out.push(
				r.y === undefined ? r : { ...r, y: r.y + (patch.flowSteps?.length ? flowDyAt(patch.flowSteps, r.y, patch.delta) : patch.delta) }
			);
			continue;
		}
		if (lift.has(r)) {
			out.push(r.y === undefined ? r : { ...r, y: r.y + flowDyAt(patch.aboveSteps, r.y, 0) });
			continue;
		}
		// dropped: this is the old band. The new one takes its place, once, HERE -- so the
		// band's lines keep their position in the list relative to what precedes and follows.
		if (!placed) {
			placed = true;
			for (const n of patch.newRecs) out.push(bandRecord(n, patch, bandStamp));
		}
	}
	// a band that replaced the page's last records has nothing after it to trigger the splice
	if (!placed) for (const n of patch.newRecs) out.push(bandRecord(n, patch, bandStamp));
	return out;
}

/**
 * How far the records a patch DERIVED sit from the ones the engine then produced for the same
 * source. The derivation is only worth trusting while this stays at zero, so it runs whenever
 * a compile lands on a page whose records were adopted, and says so when it does not.
 */
export function recordDrift(
	adopted: any[],
	fresh: any[]
): { rows: number; freshRows: number; maxDy: number; maxDx: number; worst?: { ay: number; fy: number }[] } {
	const lines = (rs: any[]) =>
		rs
			.filter((r) => r.t === 'pl' && r.y !== undefined)
			.map((r) => ({ x: r.x ?? 0, y: r.y }))
			.sort((a, b) => a.y - b.y || a.x - b.x);
	const a = lines(adopted);
	const f = lines(fresh);
	let maxDy = 0;
	let maxDx = 0;
	const worst: { ay: number; fy: number }[] = [];
	// Paired by nearest line, not by index. Index pairing survives only while the two lists are
	// the same length: one missing row shifts every later comparison onto the wrong line, and
	// the numbers it then reports measure the gap between neighbours -- a column offset on a
	// two-column page, a page height across a break. The count difference is the real signal,
	// so it must not arrive wrapped in displacements nobody can act on.
	// Both axes, because y alone is ambiguous by construction on a multi-column page: every
	// line in column two shares its band of y with a line in column one.
	for (const p of a) {
		let best: { x: number; y: number } | null = null;
		let bestD = Infinity;
		for (const q of f) {
			const d = Math.abs(q.y - p.y) + Math.abs(q.x - p.x);
			if (d < bestD) {
				bestD = d;
				best = q;
			}
		}
		if (!best) break;
		if (Math.abs(p.y - best.y) > 0.05) worst.push({ ay: +p.y.toFixed(2), fy: +best.y.toFixed(2) });
		maxDy = Math.max(maxDy, Math.abs(p.y - best.y));
		maxDx = Math.max(maxDx, Math.abs(p.x - best.x));
	}
	// the WORST drifted rows: where the store disagrees decides shift-region bug vs scatter
	worst.sort((u, v) => Math.abs(v.ay - v.fy) - Math.abs(u.ay - u.fy));
	worst.length = Math.min(worst.length, 6);
	return { rows: a.length, freshRows: f.length, maxDy: +maxDy.toFixed(2), maxDx: +maxDx.toFixed(2), ...(worst.length ? { worst } : {}) };
}

/** the source stamp the replaced band carried, to put back on the band that replaces it */
export function bandStampOf(records: any[], b1: number, bk: number): { s?: number; sf?: number } {
	for (const r of records) if (r.t === 'pl' && r.s !== undefined && r.y >= b1 - 0.5 && r.y <= bk + 0.5) return { s: r.s, sf: r.sf };
	return {};
}

// The compiler stamps a paragraph's source line ONCE, at its start, so every line it sets
// carries the same value (page-extract's texpile_para). Writing the band's own start line onto
// each of the daemon's lines is therefore what the engine would have emitted, not an estimate
// of it -- the daemon has no document line numbers of its own to report.
function bandRecord(r: any, patch: Patch, stamp: { s?: number; sf?: number }): any {
	if (r.t === 'font') return r;
	const out: any = { ...r, x: (r.x ?? 0) + patch.paraLeft, y: (r.y ?? 0) + patch.top };
	// The daemon calls a line box `line`; the page walk calls the SAME thing `pl` -- walker.lua
	// emits both, 114 lines apart. Splicing the daemon's records in untranslated left the store
	// with NO line boxes where the edited paragraph is: glyphs correct, page correct, and a hole
	// that every pl consumer reads (pageSkeleton by index range, calVariants, seams, nextSlot,
	// aboveGalley). It cost the NEXT edit on that page, never this one, which is why nothing
	// caught it -- patch-verify grades glyphs, and recordDrift only runs behind a compile that
	// adoption had just cancelled.
	if (r.t === 'line') {
		out.t = 'pl';
		for (const k of ['n', 'gset', 'gsign', 'gord', 'rdw']) delete out[k];
		if (patch.col !== undefined) out.c = patch.col;
	}
	if (out.t === 'pl' && stamp.s !== undefined) {
		out.s = stamp.s;
		if (stamp.sf !== undefined) out.sf = stamp.sf;
	}
	return out;
}
