// a color family a theme sets in part, filled out to all eleven shades as Skeleton's theme builder blends them: the
// shades it sets are the anchors, white lies past the lightest and black past the darkest

const FAMILIES = ['primary', 'secondary', 'tertiary', 'success', 'warning', 'error', 'surface'] as const;
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

export type ColorFamily = (typeof FAMILIES)[number];
/** an anchor shade's color where a blend uses it: its var() in a stylesheet, the value itself on a tile */
export type ShadeRef = (shade: number, value: string) => string;

function declaredValue(css: string, name: string): string | null {
	return new RegExp(`${name}\\s*:\\s*([^;}]+)`).exec(css)?.[1].trim() ?? null;
}

export function declaredShades(css: string, family: ColorFamily): Map<number, string> {
	const set = new Map<number, string>();
	for (const shade of SHADES) {
		const value = declaredValue(css, `--color-${family}-${shade}(?![0-9])`);
		if (value) set.set(shade, value);
	}
	return set;
}

/** the shades the theme leaves out, blended in OKLab between the nearest ones it sets */
export function fillFamily(set: Map<number, string>, ref: ShadeRef): Map<number, string> {
	const filled = new Map<number, string>();
	if (!set.size) return filled;
	const anchors = new Map(set);
	function at(shade: number): string {
		return ref(shade, anchors.get(shade)!);
	}
	const lightest = SHADES.find((s) => set.has(s))!;
	const darkest = SHADES.findLast((s) => set.has(s))!;
	if (!set.has(50)) filled.set(50, `color-mix(in oklab, ${at(lightest)} 6%, white)`);
	if (!set.has(950)) filled.set(950, `color-mix(in oklab, ${at(darkest)} 25%, black)`);
	for (const [shade, value] of filled) anchors.set(shade, value);
	const ends = SHADES.map((s, i) => (anchors.has(s) ? i : -1)).filter((i) => i >= 0);
	SHADES.forEach((shade, i) => {
		if (anchors.has(shade)) return;
		const a = ends.findLast((e) => e < i)!;
		const b = ends.find((e) => e > i)!;
		const share = Math.round(((b - i) / (b - a)) * 100);
		filled.set(shade, `color-mix(in oklab, ${at(SHADES[a])} ${share}%, ${at(SHADES[b])})`);
	});
	return filled;
}

/** text on a shade: black on a light one, white on a dark one */
function contrastOf(family: ColorFamily, shade: number): string {
	return `oklch(from var(--color-${family}-${shade}) calc((0.62 - l) * 1000) 0 0)`;
}

/** the declarations a theme leaves out of each family it touches, with every shade's text color to match */
export function filledShadesCss(css: string): string {
	const lines: string[] = [];
	for (const family of FAMILIES) {
		const set = declaredShades(css, family);
		if (!set.size) continue;
		for (const [shade, value] of fillFamily(set, (s) => `var(--color-${family}-${s})`)) lines.push(`--color-${family}-${shade}: ${value};`);
		for (const shade of SHADES) {
			const name = `--color-${family}-contrast-${shade}`;
			if (declaredValue(css, `${name}(?![0-9])`) === null) lines.push(`${name}: ${contrastOf(family, shade)};`);
		}
	}
	return lines.length ? `\n:root {\n\t${lines.join('\n\t')}\n}\n` : '';
}
