// the size an image's own command gives: LaTeX's width= and height= of \includegraphics, Typst's width: and height:
import type { StyleLook } from '$lib/editor/canvas';

// in ems of the editor's font, which stands for the 10pt article class's
const EMS: Record<string, number> = { pt: 0.1, bp: 72.27 / 720, mm: 72.27 / 254, cm: 72.27 / 25.4, in: 7.227, pc: 1.2, em: 1, ex: 0.43 };
const SHARES = /^([\d.]*)\s*\\(linewidth|textwidth|columnwidth|hsize)$/;
const LENGTH = /^([\d.]+)\s*(pt|bp|mm|cm|in|pc|em|ex)$/;
const PERCENT = /^([\d.]+)\s*%$/;

/** a CSS length for a written one, null when it is not one the column can draw; a share is of the column's width */
function cssLength(written: string, shares: boolean): string | null {
	const value = written.trim();
	const share = shares ? (SHARES.exec(value) ?? PERCENT.exec(value)) : null;
	if (share) {
		const factor = share[1] === '' ? 1 : Number(share[1]) / (share[2] ? 1 : 100);
		return Number.isFinite(factor) && factor > 0 ? `calc(100% * ${factor})` : null;
	}
	const length = LENGTH.exec(value);
	const ems = length ? Number(length[1]) * EMS[length[2]] : NaN;
	return ems > 0 ? `${ems}em` : null;
}

function optionsOf(options: string): Map<string, string> {
	const found = new Map<string, string>();
	for (const part of options.split(',')) {
		const [key, ...value] = part.split(/[=:]/);
		found.set(key.trim(), value.join('=').trim());
	}
	return found;
}

/** the width and height the command gives the picture, null when it gives none the column can draw */
export function commandSizeLook(options: unknown): StyleLook | null {
	if (typeof options !== 'string' || !options.trim()) return null;
	const given = optionsOf(options);
	const width = given.has('width') ? cssLength(given.get('width')!, true) : null;
	const height = given.has('height') ? cssLength(given.get('height')!, false) : null;
	if (!width && !height) return null;
	if (width && height && given.has('keepaspectratio')) return { width, maxHeight: height };
	return { ...(width ? { width } : {}), ...(height ? { height } : {}) };
}
