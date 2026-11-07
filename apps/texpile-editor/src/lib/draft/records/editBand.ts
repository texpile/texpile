/* eslint-disable @typescript-eslint/no-explicit-any */
// What an edit changed on a page: its lines whose text differs from the page shown before. A line's source stamp is
// no guide, because TeX stamps material it read ahead (a beamer frame, a footnote) with the line it read up to.
import type { EditBand } from '../draftViewport.svelte';

type PageLine = { text: string; top: number; bottom: number; left: number; right: number };

function pageLines(records: any[]): PageLine[] {
	const fonts = new Map(records.filter((r) => r.t === 'font').map((r) => [r.id, `${r.name}@${r.size}`]));
	const lines: PageLine[] = [];
	let line: PageLine | null = null;
	for (const r of records) {
		if (r.t === 'pl') {
			line = { text: '', top: r.y - r.h, bottom: r.y + (r.d ?? 0), left: r.x, right: r.x + r.w };
			lines.push(line);
		} else if (r.t === 'hb') line = null;
		else if (line && r.t === 'g') line.text += `${r.c}:${fonts.get(r.f)} `;
	}
	return lines;
}

/** the band of the lines that differ between the page's records before and after, or null when none does */
export function changedBand(page: number, before: any[], after: any[]): EditBand | null {
	const a = pageLines(before);
	const b = pageLines(after);
	let head = 0;
	while (head < a.length && head < b.length && a[head].text === b[head].text) head++;
	let tail = 0;
	while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail].text === b[b.length - 1 - tail].text) tail++;
	const changed = b.slice(head, b.length - tail);
	if (!changed.length) return null;
	return {
		page,
		top: Math.min(...changed.map((l) => l.top)),
		bottom: Math.max(...changed.map((l) => l.bottom)),
		colL: Math.min(...changed.map((l) => l.left)),
		colR: Math.max(...changed.map((l) => l.right))
	};
}
