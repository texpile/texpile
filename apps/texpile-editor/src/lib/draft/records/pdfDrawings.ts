// The drawings a compile's PDF holds, by what they show (the walker's `k`): a page the PDF does not have yet crops the
// same drawing from there.

/* eslint-disable @typescript-eslint/no-explicit-any */

export type PdfDrawing = { n: number; rec: any };

export function pdfDrawings(pages: { n: number; records: string }[]): Map<string, PdfDrawing> {
	const out = new Map<string, PdfDrawing>();
	for (const p of pages)
		for (const line of p.records.split('\n')) {
			if (!line.startsWith('{"t":"lit"')) continue;
			try {
				const rec = JSON.parse(line);
				if (rec.k && !out.has(rec.k)) out.set(rec.k, { n: p.n, rec });
			} catch {
				/* unreadable: the drawing stays a placeholder */
			}
		}
	return out;
}
