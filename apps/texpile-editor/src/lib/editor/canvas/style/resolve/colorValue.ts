// every computed color form Chromium, Gecko and WebKit return, as sRGB Rgba and a fill string every canvas accepts
import type { Rgba } from '../../contracts/styleTypes';
import { namedColorHex } from './namedColors';

type Triple = [number, number, number];

export const TRANSPARENT: Rgba = { r: 0, g: 0, b: 0, a: 0 };
const NAMED: Record<string, Rgba> = {
	transparent: TRANSPARENT,
	black: { r: 0, g: 0, b: 0, a: 1 },
	white: { r: 1, g: 1, b: 1, a: 1 }
};

function clamp01(n: number): number {
	return Math.min(1, Math.max(0, n));
}

function gammaEncode(c: number): number {
	const abs = Math.abs(c);
	return Math.sign(c) * (abs > 0.0031308 ? 1.055 * abs ** (1 / 2.4) - 0.055 : 12.92 * abs);
}

function gammaDecode(c: number): number {
	const abs = Math.abs(c);
	return Math.sign(c) * (abs > 0.04045 ? ((abs + 0.055) / 1.055) ** 2.4 : abs / 12.92);
}

function linearFromOklab([l, a, b]: Triple): Triple {
	const lc = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const mc = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const sc = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
	return [
		4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc,
		-1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc,
		-0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc
	];
}

function oklabFromLinear([r, g, b]: Triple): Triple {
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	return [
		0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
	];
}

function linearFromDisplayP3([r, g, b]: Triple): Triple {
	return [1.2249401 * r - 0.2249404 * g, -0.0420569 * r + 1.0420571 * g, -0.0196376 * r - 0.0786361 * g + 1.0982735 * b];
}

/** CIE Lab (D50) to linear sRGB through XYZ and the Bradford adaptation to D65 */
function linearFromLab([l, a, b]: Triple): Triple {
	const fy = (l + 16) / 116;
	const fx = fy + a / 500;
	const fz = fy - b / 200;
	function inverse(t: number): number {
		return t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27);
	}
	const x = (0.3457 / 0.3585) * inverse(fx);
	const y = inverse(fy);
	const z = ((1 - 0.3457 - 0.3585) / 0.3585) * inverse(fz);
	const x65 = 0.9554734527 * x - 0.0230985368 * y + 0.0632593086 * z;
	const y65 = -0.0283697093 * x + 1.009995458 * y + 0.0210413989 * z;
	const z65 = 0.0123140016 * x - 0.0205076964 * y + 1.3303659366 * z;
	return [
		3.2409699419 * x65 - 1.5373831776 * y65 - 0.4986107603 * z65,
		-0.9692436363 * x65 + 1.8759675015 * y65 + 0.0415550574 * z65,
		0.0556300797 * x65 - 0.2039769589 * y65 + 1.0569715142 * z65
	];
}

/** oklch of an sRGB color: lightness, chroma, hue in degrees */
export function oklchOf(color: Rgba): Triple {
	const [l, a, b] = oklabFromLinear([color.r, color.g, color.b].map(gammaDecode) as Triple);
	return [l, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360];
}

function srgbFromHsl(h: number, s: number, l: number): Triple {
	function channel(n: number): number {
		const k = (n + h / 30) % 12;
		return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
	}
	return [channel(0), channel(8), channel(4)];
}

function srgbFromHwb(h: number, w: number, bl: number): Triple {
	if (w + bl >= 1) return [w / (w + bl), w / (w + bl), w / (w + bl)];
	return srgbFromHsl(h, 1, 0.5).map((c) => c * (1 - w - bl) + w) as Triple;
}

/** splits a function's arguments at spaces, commas and the slash before alpha, outside nested parentheses */
function argumentsOf(body: string): { parts: string[]; alpha: string | null } {
	const parts: string[] = [];
	let alpha: string | null = null;
	let depth = 0;
	let current = '';
	let afterSlash = false;
	function push(): void {
		if (!current) return;
		if (afterSlash) alpha = current;
		else parts.push(current);
		current = '';
	}
	for (const c of body) {
		if (c === '(') depth++;
		if (c === ')') depth--;
		if (depth === 0 && (c === ' ' || c === ',' || c === '/')) {
			push();
			if (c === '/') afterSlash = true;
			continue;
		}
		current += c;
	}
	push();
	return { parts, alpha };
}

/** a number, a percentage scaled by `percentOf`, or none as 0 */
function numberOf(token: string, percentOf = 1): number {
	if (token === 'none') return 0;
	if (token.endsWith('%')) return (parseFloat(token) / 100) * percentOf;
	return parseFloat(token);
}

function hueOf(token: string): number {
	if (token === 'none') return 0;
	const n = parseFloat(token);
	if (token.endsWith('rad')) return (n * 180) / Math.PI;
	if (token.endsWith('grad')) return n * 0.9;
	if (token.endsWith('turn')) return n * 360;
	return n;
}

function rgbaOf(linearOrEncoded: Triple, alpha: number, encoded: boolean): Rgba {
	const [r, g, b] = encoded ? linearOrEncoded : (linearOrEncoded.map(gammaEncode) as Triple);
	return { r: clamp01(r), g: clamp01(g), b: clamp01(b), a: clamp01(alpha) };
}

function colorFunction(parts: string[], alpha: number): Rgba | null {
	const [space, ...channels] = parts;
	const values = channels.map((c) => numberOf(c)) as Triple;
	if (values.length !== 3) return null;
	if (space === 'srgb') return rgbaOf(values, alpha, true);
	if (space === 'srgb-linear') return rgbaOf(values, alpha, false);
	if (space === 'display-p3') return rgbaOf(linearFromDisplayP3(values.map(gammaDecode) as Triple), alpha, false);
	if (space === 'xyz' || space === 'xyz-d65') {
		const [x, y, z] = values;
		return rgbaOf(
			[
				3.2409699419 * x - 1.5373831776 * y - 0.4986107603 * z,
				-0.9692436363 * x + 1.8759675015 * y + 0.0415550574 * z,
				0.0556300797 * x - 0.2039769589 * y + 1.0569715142 * z
			],
			alpha,
			false
		);
	}
	return null;
}

function hexColor(hex: string): Rgba | null {
	const digits = hex.length <= 4 ? [...hex].map((c) => c + c).join('') : hex;
	if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(digits)) return null;
	function byte(i: number): number {
		return parseInt(digits.slice(i, i + 2), 16) / 255;
	}
	return { r: byte(0), g: byte(2), b: byte(4), a: digits.length === 8 ? byte(6) : 1 };
}

/** colors already parsed, by computed value: a first screen reads the same few dozen many times */
const parsedColors = new Map<string, Rgba | null>();
const PARSED_COLORS_KEPT = 512;

/** the color a computed value names; currentColor and color-mix() resolve against `current` */
export function parseColor(value: string, current: Rgba = NAMED.black): Rgba | null {
	const known = parsedColors.get(value);
	if (known !== undefined) return known;
	const text = value.trim().toLowerCase();
	if (text.includes('currentcolor')) return text === 'currentcolor' ? current : colorOf(text, current);
	const color = colorOf(text, current);
	if (parsedColors.size >= PARSED_COLORS_KEPT) parsedColors.clear();
	parsedColors.set(value, color);
	return color;
}

function colorOf(text: string, current: Rgba): Rgba | null {
	if (NAMED[text]) return NAMED[text];
	const named = namedColorHex(text);
	if (named) return colorOf(named, current);
	if (text.startsWith('#')) return hexColor(text.slice(1));
	const open = text.indexOf('(');
	if (open < 0 || !text.endsWith(')')) return null;
	const name = text.slice(0, open);
	const body = text.slice(open + 1, -1);
	if (name === 'color-mix') return mixedColor(body, current);
	const { parts, alpha: slashAlpha } = argumentsOf(body);
	// the legacy comma forms rgba(r, g, b, a) and hsla(h, s, l, a) carry alpha as a fourth argument
	const alphaToken = slashAlpha ?? (name !== 'color' && parts.length === 4 ? parts.pop()! : null);
	const alpha = alphaToken === null ? 1 : numberOf(alphaToken);
	if (name === 'rgb' || name === 'rgba') {
		const channels = parts.map((p) => numberOf(p, 255) / 255) as Triple;
		return channels.length === 3 ? rgbaOf(channels, alpha, true) : null;
	}
	return spaceColor(name, parts, alpha);
}

/** the color functions other than rgb(), apart so a cold engine compiles them only for a sheet that uses one */
function spaceColor(name: string, parts: string[], alpha: number): Rgba | null {
	if (name === 'color') return colorFunction(parts, alpha);
	if (parts.length !== 3) return null;
	const [first, second, third] = parts;
	if (name === 'oklab') return rgbaOf(linearFromOklab([numberOf(first), numberOf(second, 0.4), numberOf(third, 0.4)]), alpha, false);
	if (name === 'oklch') {
		const [l, c, h] = [numberOf(first), numberOf(second, 0.4), (hueOf(third) * Math.PI) / 180];
		return rgbaOf(linearFromOklab([l, c * Math.cos(h), c * Math.sin(h)]), alpha, false);
	}
	if (name === 'lab') return rgbaOf(linearFromLab([numberOf(first, 100), numberOf(second, 125), numberOf(third, 125)]), alpha, false);
	if (name === 'lch') {
		const [l, c, h] = [numberOf(first, 100), numberOf(second, 150), (hueOf(third) * Math.PI) / 180];
		return rgbaOf(linearFromLab([l, c * Math.cos(h), c * Math.sin(h)]), alpha, false);
	}
	if (name === 'hsl' || name === 'hsla') return rgbaOf(srgbFromHsl(hueOf(first), numberOf(second, 1), numberOf(third, 1)), alpha, true);
	if (name === 'hwb') return rgbaOf(srgbFromHwb(hueOf(first), numberOf(second, 1), numberOf(third, 1)), alpha, true);
	return null;
}

/** color-mix() an engine left unresolved (currentColor in it), mixed in srgb or oklab as the sheets write it */
function mixedColor(body: string, current: Rgba): Rgba | null {
	const comma = splitTopLevel(body);
	if (comma.length !== 3) return null;
	const space = comma[0].replace(/^in\s+/, '').trim();
	const sides = comma.slice(1).map((side) => {
		const match = /\s(-?[\d.]+)%$/.exec(side.trim());
		return {
			color: parseColor(match ? side.trim().slice(0, match.index) : side, current),
			share: match ? parseFloat(match[1]) / 100 : null
		};
	});
	const [one, two] = sides;
	if (!one.color || !two.color) return null;
	let p1 = one.share ?? (two.share === null ? 0.5 : 1 - two.share);
	let p2 = two.share ?? 1 - p1;
	const total = p1 + p2;
	const scale = total < 1 ? total : 1;
	p1 /= total;
	p2 /= total;
	function into(c: Rgba): Triple {
		const linear = [c.r, c.g, c.b].map(gammaDecode) as Triple;
		if (space === 'oklab') return oklabFromLinear(linear);
		return space === 'srgb-linear' ? linear : [c.r, c.g, c.b];
	}
	const a = one.color.a * p1 + two.color.a * p2;
	const [x, y] = [into(one.color), into(two.color)];
	const mixed = (a ? x.map((v, i) => (v * one.color!.a * p1 + y[i] * two.color!.a * p2) / a) : [0, 0, 0]) as Triple;
	const out = space === 'oklab' ? rgbaOf(linearFromOklab(mixed), a, false) : rgbaOf(mixed, a, space !== 'srgb-linear');
	return { ...out, a: out.a * scale };
}

function splitTopLevel(body: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let start = 0;
	for (let i = 0; i < body.length; i++) {
		if (body[i] === '(') depth++;
		else if (body[i] === ')') depth--;
		else if (body[i] === ',' && depth === 0) {
			parts.push(body.slice(start, i));
			start = i + 1;
		}
	}
	parts.push(body.slice(start));
	return parts;
}

/** rgba() with byte channels: the one form every canvas fillStyle accepts */
export function canvasFill(color: Rgba): string {
	function byte(c: number): number {
		return Math.round(clamp01(c) * 255);
	}
	return `rgba(${byte(color.r)}, ${byte(color.g)}, ${byte(color.b)}, ${Math.round(clamp01(color.a) * 1000) / 1000})`;
}

export function sameColor(one: Rgba, two: Rgba): boolean {
	return one.r === two.r && one.g === two.g && one.b === two.b && one.a === two.a;
}
