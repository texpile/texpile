import { isColor } from './styleOptions';

// a node's text, read from and written to its own option items

/** Excalidraw's four sizes, as the font sizes LaTeX names them */
export const TEXT_SIZES = [
	{ value: 'small', label: 'S' },
	{ value: 'normalsize', label: 'M' },
	{ value: 'large', label: 'L' },
	{ value: 'Large', label: 'XL' }
] as const;
const SIZE_MACRO = /\\(?:tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|Huge)\b/;

function valueOf(item: string, key: string) {
	const m = new RegExp(`^${key}\\s*=\\s*(.*)$`).exec(item);
	return m ? m[1].replace(/^\{(.*)\}$/, '$1').trim() : null;
}

/** `text=`, else `color=` or a bare color, which a node's text takes as its border does */
export function readTextColor(items: string[]) {
	let color = 'black';
	for (const item of items) {
		const v = valueOf(item, 'text') ?? valueOf(item, 'color');
		if (v !== null) color = v;
		else if (isColor(item)) color = item;
	}
	return color;
}

export function withTextColor(items: string[], color: string | null) {
	const kept = items.filter((i) => valueOf(i, 'text') === null);
	return color === null || color === 'black' ? kept : [...kept, `text=${color}`];
}

export function readTextSize(items: string[]) {
	const font = items
		.map((i) => valueOf(i, 'font'))
		.filter((v) => v !== null)
		.at(-1);
	if (!font) return 'normalsize';
	const size = SIZE_MACRO.exec(font)?.[0].slice(1);
	return TEXT_SIZES.some((s) => s.value === size) ? size! : 'custom';
}

/** the size macro in `font=` swapped, so a `\bfseries` beside it stays */
export function withTextSize(items: string[], size: string) {
	const at = items.findIndex((i) => valueOf(i, 'font') !== null);
	const font = at < 0 ? '' : valueOf(items[at], 'font')!;
	const rest = font.replace(SIZE_MACRO, '').trim();
	const next = size === 'normalsize' ? rest : `\\${size}${rest ? ` ${rest}` : ''}`;
	const kept = items.filter((_, k) => k !== at);
	if (!next) return kept;
	kept.splice(at < 0 ? kept.length : at, 0, `font=${next}`);
	return kept;
}
