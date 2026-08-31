/* eslint-disable @typescript-eslint/no-explicit-any */
// Painting page records onto a canvas, and the column-aware record split that composes a
// live patch into an existing page.
import { buildDrawList } from './renderCore';
import { hasRecordedColumns, recordColumns } from './geometry/recordColumns';
import type { DraftFonts } from './draftFonts';
import type { DraftBitmaps } from './draftBitmaps';
import type { PaperMetrics } from './locate/locate.types';
import type { Patch } from './patch/patch.types';

export type PaintDeps = {
	fonts: DraftFonts;
	bitmaps: DraftBitmaps;
	paper: PaperMetrics;
};

// (patch-time image records draw as placeholders: which FILE a daemon image box shows
// was a JS dimension-match guess that could swap same-sized figures -- deleted. The
// reconcile's compile attaches filenames engine-side and paints the real figure.)
/* eslint-disable no-param-reassign -- painting sets the canvas context's state */
// eslint-disable-next-line @typescript-eslint/naming-convention -- S is the page scale factor
export function paintRecords(ctx: CanvasRenderingContext2D, records: any[], S: number, dy = 0, pageNo = 0, d: PaintDeps): void {
	const idMap = d.fonts.idMapFor(records);
	const { ops } = buildDrawList(records, (id) => idMap[id] || null, S, { glyphFill: '#000', ruleFill: '#000' });
	ctx.save();
	ctx.translate(d.paper.mx * S, (d.paper.my + dy) * S);
	for (const op of ops) {
		if (op.kind === 'glyph') {
			op.path.fill = op.fill;
			// a plain antialiased fill reads visibly thinner than the pdf.js raster it
			// replaces (measured ~25% lighter strokes): a hairline stroke restores the weight
			op.path.stroke = op.fill;
			op.path.strokeWidth = 0.3;
			op.path.draw(ctx);
		} else if (op.kind === 'rect') {
			ctx.fillStyle = op.fill;
			ctx.fillRect(op.x, op.y, op.w, op.h);
		} else if (op.kind === 'image') {
			const file = (op.rec as any)?.file as string | undefined;
			const bmp = file ? d.bitmaps.img(file) : undefined;
			if (bmp && bmp !== 'loading' && bmp !== 'failed') {
				ctx.drawImage(bmp, op.x, op.y, op.w, op.h);
			} else {
				// unresolved or still loading -> geometry-exact placeholder
				ctx.fillStyle = '#e5e7eb';
				ctx.strokeStyle = '#9ca3af';
				ctx.fillRect(op.x, op.y, op.w, op.h);
				ctx.strokeRect(op.x, op.y, op.w, op.h);
				if (file && pageNo && !d.bitmaps.hasImg(file)) d.bitmaps.ensureImage(file, pageNo, op.w);
			}
		} else if (op.kind === 'missing') {
			// a glyph whose font the renderer could not parse (a virtual font, an unresolved
			// Type1): the geometry is engine-exact, only the ink is unavailable. Drawn as a
			// faint box because a silent gap looks like intent -- the exact-PDF raster shows
			// the real glyphs at rest, and the reconcile's page replaces this within a second
			ctx.fillStyle = '#eef0f3';
			ctx.fillRect(op.x, op.y, op.w, op.h);
		} else if (op.kind === 'pixels') {
			const bmp = d.bitmaps.pix(d.bitmaps.pixKey(pageNo, op.rec));
			if (bmp && bmp !== 'loading' && bmp !== 'failed') {
				ctx.drawImage(bmp, op.x, op.y, op.w, op.h);
			} else {
				// crop still rasterizing -> light geometry-exact placeholder
				ctx.fillStyle = '#f3f4f6';
				ctx.fillRect(op.x, op.y, op.w, op.h);
				if (pageNo) d.bitmaps.ensurePixels(pageNo, op.rec);
			}
		}
	}
	ctx.restore();
}
/* eslint-enable no-param-reassign */

// column-aware 3-way split per SEGMENT (page-box-local pt): each record belongs to the
// segment whose column contains it -- drop that segment's band, shift its below-band
// content by its delta; records outside every segment stay put. The page-number footer
// sits in the bottom margin (below the content box height) and is bottom-anchored by
// TeX -- never shift it with the flow.
export function splitPatchRecords(
	records: any[],
	patches: Patch[],
	contentBottom: number
): { unchanged: any[]; shifted: any[][]; raised: any[][] } {
	const unchanged: any[] = [];
	const shifted: any[][] = patches.map(() => []);
	// content ABOVE the band that a certificate says the engine respaced. Its own bucket
	// because it moves by aboveSteps from a zero default, where shifted moves by flowSteps
	// from the band's delta -- one region, one meaning each.
	const raised: any[][] = patches.map(() => []);
	// column membership as the compile recorded it. The x-window below stands in only for
	// pages with no recorded columns: it cannot tell a full-width float or a footer from the
	// column whose x-range it happens to lie in (measured: 2,006 such glyphs on one paper).
	const byRun = hasRecordedColumns(records) ? recordColumns(records) : null;
	const patchCol = patches.map((p) => p.col ?? -1);
	for (let ri = 0; ri < records.length; ri++) {
		const r = records[ri];
		if (r.t === 'font') {
			// every bucket is painted as its own array and paintRecords resolves glyph ids from
			// the array it is handed, so a bucket without the font table draws nothing at all
			unchanged.push(r);
			for (const a of shifted) a.push(r);
			for (const a of raised) a.push(r);
			continue;
		}
		// no y = non-positional record (endx, note markers): pass through untouched. A
		// NEGATIVE y is real content -- beamer headlines sit above the reference origin,
		// and skipping them here silently erased slide titles from every patched render.
		if (r.y === undefined) {
			unchanged.push(r);
			continue;
		}
		const y = r.y;
		const x = r.x ?? -1e4;
		// by recorded column when both the page and the patch know theirs, else by x-window.
		// A record in NO column is furniture and belongs to no patch: it must not fall back to
		// the x-window, which is what wrongly claimed it in the first place.
		const useRuns = byRun !== null && patchCol.some((c) => c >= 0);
		const pi = useRuns ? (byRun![ri] >= 0 ? patchCol.indexOf(byRun![ri]) : -1) : patches.findIndex((p) => x >= p.colL && x <= p.colR);
		if (pi < 0 || y > contentBottom) {
			unchanged.push(r);
			continue;
		}
		const p = patches[pi];
		if (y < p.dropTop) {
			if (p.aboveSteps?.length) raised[pi].push(r);
			else unchanged.push(r);
		} else if (y > p.dropBottom) {
			if (p.flowBottom !== undefined && y > p.flowBottom) unchanged.push(r);
			else if (p.clipBottom === undefined || y + p.delta <= p.clipBottom) shifted[pi].push(r);
		}
	}
	return { unchanged, shifted, raised };
}
