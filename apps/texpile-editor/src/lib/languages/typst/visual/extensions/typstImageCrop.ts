// a crop in Typst: image() has none, so a cropped image is wrapped in texpile-crop, defined once in the document
import type { Node as PMNode } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import { isUncropped } from '$lib/images/crop/cropGeometry';
import type { ImageCropFormat } from '$lib/editor/visual/extensions/image/crop/imageCropFormat';

export const TYPST_CROP_HELPER = `#let texpile-crop(left: 0%, top: 0%, right: 0%, bottom: 0%, turn: 0deg, body) = layout(size => {
  let s = measure(body, width: size.width)
  let cut = box(clip: true, width: s.width * (100% - left - right), height: s.height * (100% - top - bottom),
    move(dx: -s.width * left, dy: -s.height * top, box(width: size.width, body)))
  if turn == 0deg { cut } else { rotate(turn, reflow: true, cut) }
})`;

const CROP_CALL = 'texpile-crop';

/** each side cut in percent of the image, and the turn in degrees counterclockwise */
export type TypstCrop = { left: number; top: number; right: number; bottom: number; turn: number };

const ARG = /^(left|top|right|bottom|turn)\s*:\s*(-?\d+(?:\.\d+)?)(%|deg)$/;

/** the block that defines texpile-crop, which the paper draws as one line */
export function isCropHelper(source: string): boolean {
	return source.trimStart().startsWith(`#let ${CROP_CALL}(`);
}

export function isCropCall(name: string): boolean {
	return name === CROP_CALL;
}

/** the crop texpile-crop's named arguments give, or null for one this does not write */
export function cropOfArgs(args: string[]): TypstCrop | null {
	const crop: TypstCrop = { left: 0, top: 0, right: 0, bottom: 0, turn: 0 };
	for (const arg of args) {
		const m = ARG.exec(arg.trim());
		if (!m || (m[1] === 'turn') !== (m[3] === 'deg')) return null;
		crop[m[1] as keyof TypstCrop] = Number(m[2]);
	}
	return crop;
}

function number(v: number): string {
	return String(Math.round(v * 10) / 10);
}

/** `image` wrapped in the crop, or `image` itself when there is none */
export function wrapInCrop(image: string, crop: TypstCrop | null): string {
	if (!crop) return image;
	const sides = (['left', 'top', 'right', 'bottom'] as const).filter((s) => crop[s]).map((s) => `${s}: ${number(crop[s])}%`);
	const turn = crop.turn % 360 ? [`turn: ${number(crop.turn % 360)}deg`] : [];
	return `${CROP_CALL}(${[...sides, ...turn, image].join(', ')})`;
}

function cropOf(node: PMNode): TypstCrop | null {
	return (node.attrs.crop as TypstCrop | null) ?? null;
}

function hasHelper(tr: Transaction): boolean {
	let found = false;
	tr.doc.descendants((n) => {
		if (found || !n.isTextblock) return !found;
		found = n.textContent.includes(`#let ${CROP_CALL}(`);
		return false;
	});
	return found;
}

export const typstCropFormat: ImageCropFormat = {
	key(node) {
		const crop = cropOf(node);
		return crop ? JSON.stringify(crop) : '';
	},
	read(node) {
		const crop = cropOf(node);
		if (!crop) return { crop: { l: 0, t: 0, r: 0, b: 0 }, turns: 0 };
		const turns = crop.turn % 90 ? 0 : (((crop.turn / 90) % 4) + 4) % 4;
		return { crop: { l: crop.left / 100, t: crop.top / 100, r: crop.right / 100, b: crop.bottom / 100 }, turns };
	},
	write(node, { crop, turns }) {
		const between = (cropOf(node)?.turn ?? 0) % 90;
		const turn = between + 90 * turns;
		const next =
			isUncropped(crop) && !(turn % 360)
				? null
				: { left: crop.l * 100, top: crop.t * 100, right: crop.r * 100, bottom: crop.b * 100, turn };
		return { ...node.attrs, crop: next };
	},
	prepare(tr) {
		if (hasHelper(tr)) return;
		const { schema } = tr.doc.type;
		tr.insert(0, schema.nodes.raw_latex.create({ lang: 'typst' }, schema.text(TYPST_CROP_HELPER)));
	}
};
