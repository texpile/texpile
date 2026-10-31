// the trim, clip and angle of an \includegraphics option list
import { UNCROPPED, turnCrop, type Crop } from '$lib/images/crop/cropGeometry';

/** cut from each side in bp, in trim's order: left, bottom, right, top */
export type GraphicsTrim = [number, number, number, number];

export type GraphicsCrop = { trim: GraphicsTrim | null; clip: boolean; angle: number };

const BP_PER: Record<string, number> = {
	bp: 1,
	pt: 72 / 72.27,
	in: 72,
	cm: 72 / 2.54,
	mm: 72 / 25.4,
	pc: (12 * 72) / 72.27,
	dd: (1238 / 1157) * (72 / 72.27),
	cc: ((12 * 1238) / 1157) * (72 / 72.27),
	sp: 72 / 72.27 / 65536
};

const CROP_KEYS = new Set(['trim', 'clip', 'angle']);

function splitOptions(options: string): string[] {
	const entries: string[] = [];
	let depth = 0;
	let from = 0;
	for (let i = 0; i < options.length; i++) {
		const c = options[i];
		if (c === '{') depth++;
		else if (c === '}') depth--;
		else if (c === ',' && depth === 0) {
			entries.push(options.slice(from, i));
			from = i + 1;
		}
	}
	entries.push(options.slice(from));
	return entries.map((e) => e.trim()).filter(Boolean);
}

function keyOf(entry: string): string {
	return entry.split('=')[0].trim();
}

function valueOf(entry: string): string {
	const at = entry.indexOf('=');
	return at < 0
		? ''
		: entry
				.slice(at + 1)
				.trim()
				.replace(/^\{(.*)\}$/s, '$1')
				.trim();
}

function toBp(length: string): number | null {
	const m = /^(-?(?:\d+\.?\d*|\.\d+))\s*([a-z]{2})?$/i.exec(length);
	if (!m) return null;
	const per = BP_PER[(m[2] ?? 'bp').toLowerCase()];
	return per === undefined ? null : Number(m[1]) * per;
}

function trimOf(value: string): GraphicsTrim | null {
	const parts = value.split(/\s+/).map(toBp);
	return parts.length === 4 && parts.every((p) => p !== null) ? (parts as GraphicsTrim) : null;
}

export function readGraphicsCrop(options: string | null): GraphicsCrop {
	const crop: GraphicsCrop = { trim: null, clip: false, angle: 0 };
	for (const entry of splitOptions(options ?? '')) {
		const key = keyOf(entry);
		if (key === 'trim') crop.trim = trimOf(valueOf(entry));
		else if (key === 'clip') crop.clip = valueOf(entry) !== 'false';
		else if (key === 'angle') crop.angle = Number(valueOf(entry)) || 0;
	}
	return crop;
}

function number(v: number): string {
	return String(Math.round(v * 10) / 10);
}

/** the options with their trim, clip and angle replaced; angle goes first so width= sizes the turned image */
export function writeGraphicsCrop(options: string, trim: GraphicsTrim | null, angle: number): string {
	const kept = splitOptions(options).filter((e) => !CROP_KEYS.has(keyOf(e)));
	const turn = angle % 360 ? [`angle=${number(angle % 360)}`] : [];
	const cut = trim && trim.some((v) => v > 0) ? [`trim=${trim.map(number).join(' ')}`, 'clip'] : [];
	return [...turn, ...kept, ...cut].join(', ');
}

/** quarter turns counterclockwise, as angle= turns, or 0 for an angle between them */
export function quarterTurns(angle: number): number {
	return angle % 90 ? 0 : (((angle / 90) % 4) + 4) % 4;
}

/** the trim as the crop of the image it cuts, before its turn; the image is `w` by `h` bp */
export function cropOfTrim(trim: GraphicsTrim | null, w: number, h: number): Crop {
	if (!trim) return UNCROPPED;
	const [l, b, r, t] = trim;
	return { l: l / w, b: b / h, r: r / w, t: t / h };
}

export function trimOfCrop(crop: Crop, w: number, h: number): GraphicsTrim {
	return [crop.l * w, crop.b * h, crop.r * w, crop.t * h];
}

/** the crop as it sits on the image turned `turns` quarters counterclockwise, or back with negative turns */
export function turnedCrop(crop: Crop, turns: number): Crop {
	let c = crop;
	for (let i = 0; i < Math.abs(turns); i++) c = turnCrop(c, turns > 0 ? 'left' : 'right');
	return c;
}
