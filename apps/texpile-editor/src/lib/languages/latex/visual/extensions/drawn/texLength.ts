// a TeX length as the editor draws it: in ems of the editor's font, or as a share of the text width; \fill,
// \stretch and \hfill stretch to whatever is left
import type { DrawnLength } from '$lib/editor/visual/extensions/drawnChips/spaceFace';

// points per unit; an em and an ex are the 10pt article class's, which is what the editor's own em stands for
const POINTS: Record<string, number> = {
	pt: 1,
	bp: 72.27 / 72,
	dd: 1238 / 1157,
	mm: 72.27 / 25.4,
	cm: 72.27 / 2.54,
	in: 72.27,
	pc: 12,
	cc: (12 * 1238) / 1157,
	sp: 1 / 65536,
	em: 10,
	ex: 4.3
};
const POINTS_PER_EM = 10;

// the registers a length is most often given in, at their article class values
const REGISTERS: Record<string, number> = {
	baselineskip: 12,
	normalbaselineskip: 12,
	parskip: 0,
	parindent: 15,
	smallskipamount: 3,
	medskipamount: 6,
	bigskipamount: 12,
	fboxsep: 3,
	tabcolsep: 6,
	itemsep: 4,
	topsep: 8,
	abovedisplayskip: 10,
	belowdisplayskip: 10,
	floatsep: 12,
	textfloatsep: 20,
	intextsep: 12
};
const WIDTHS = new Set(['linewidth', 'textwidth', 'columnwidth', 'hsize']);

/** null when it is not a length the editor can place */
export function texLength(source: string): DrawnLength | null {
	// glue: only the natural size shows
	const natural = source.replace(/\s+(?:plus|minus)\s.*$/s, '').trim();
	if (/^\\(?:fill|hfill|vfill|fil|hfil|vfil)$/.test(natural) || /^\\stretch\s*\{[^}]*\}$/.test(natural)) return { fill: true };
	const m = /^([+-]?)\s*(\d*\.?\d*)\s*(?:([a-z]{2})|\\([a-zA-Z]+))$/.exec(natural);
	if (!m) return null;
	const sign = m[1] === '-' ? -1 : 1;
	const factor = m[2] === '' ? 1 : Number(m[2]);
	if (Number.isNaN(factor)) return null;
	if (m[3]) return m[3] in POINTS ? { em: (sign * factor * POINTS[m[3]]) / POINTS_PER_EM } : null;
	if (WIDTHS.has(m[4])) return { share: sign * factor };
	return m[4] in REGISTERS ? { em: (sign * factor * REGISTERS[m[4]]) / POINTS_PER_EM } : null;
}

/** the length the way its author wrote it, for a label */
export function lengthLabel(source: string): string {
	return source.replace(/\s+/g, ' ').trim();
}
