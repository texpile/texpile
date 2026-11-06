/* eslint-disable @typescript-eslint/no-explicit-any */
// Painting page records onto a canvas.
import { buildDrawList } from './renderCore';
import type { DraftFonts } from './draftFonts';
import type { DraftBitmaps } from './draftBitmaps';
import type { PaperMetrics } from '../draftPaper';
import type { PdfDrawing } from '../records/pdfDrawings';

export type PaintDeps = {
	fonts: DraftFonts;
	bitmaps: DraftBitmaps;
	paper: PaperMetrics;
	// the compile's PDF holds this page as drawn; a page a teleport drew is not in it yet
	inPdf: boolean;
	// where the compile's PDF drew the same drawing
	drawingInPdf: (rec: any) => PdfDrawing | undefined;
};

/* eslint-disable no-param-reassign -- painting sets the canvas context's state */
/** on a page the PDF does not have, how many drawings came from the compile's PDF and how many it does not hold */
export type PaintedDrawings = { fromPdf: number; unmatched: number };

// eslint-disable-next-line @typescript-eslint/naming-convention -- S is the page scale factor
export function paintRecords(ctx: CanvasRenderingContext2D, records: any[], S: number, dy = 0, pageNo = 0, d: PaintDeps): PaintedDrawings {
	const drawings: PaintedDrawings = { fromPdf: 0, unmatched: 0 };
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
			const src = d.inPdf ? { n: pageNo, rec: op.rec } : d.drawingInPdf(op.rec);
			if (!d.inPdf) drawings[src ? 'fromPdf' : 'unmatched']++;
			const bmp = src ? d.bitmaps.pix(d.bitmaps.pixKey(src.n, src.rec)) : undefined;
			if (bmp && bmp !== 'loading' && bmp !== 'failed') {
				ctx.drawImage(bmp, op.x, op.y, op.w, op.h);
			} else {
				// crop still rasterizing, or a drawing the compile's PDF does not have -> light geometry-exact placeholder
				ctx.fillStyle = '#f3f4f6';
				ctx.fillRect(op.x, op.y, op.w, op.h);
				if (pageNo && src) d.bitmaps.ensurePixels(src.n, src.rec, pageNo);
			}
		}
	}
	ctx.restore();
	return drawings;
}
/* eslint-enable no-param-reassign */
