// a crop in Typst: image() has none, so a cropped image is wrapped in texpile-crop, defined once in the document
import type { Node as PMNode } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import { isUncropped } from '$lib/images/crop/cropGeometry';
import type { ImageCropFormat } from '$lib/editor/visual/extensions/image/crop/imageCropFormat';

// `width` on the image sizes what is shown, cut and turned, as in LaTeX and in the paper
export const TYPST_CROP_HELPER = `#let texpile-crop(left: 0%, top: 0%, right: 0%, bottom: 0%, turn: 0deg, body) = layout(size => {
  let s = measure(body, width: size.width)
  let kept-w = (100% - left - right) / 100%
  let kept-h = (100% - top - bottom) / 100%
  let sideways = calc.rem(calc.abs(calc.round(turn / 90deg)), 2) == 1
  let k = if sideways { s.width / (s.height * kept-h) } else { 1 / kept-w }
  let cut = box(clip: true, width: s.width * kept-w * k, height: s.height * kept-h * k,
    move(dx: -s.width * k * (left / 100%), dy: -s.height * k * (top / 100%),
      scale(x: k * 100%, y: k * 100%, reflow: true, box(width: size.width, body))))
  if turn == 0deg { cut } else { rotate(turn, reflow: true, cut) }
})`;

export const CROP_CALL = 'texpile-crop';

export type TypstCrop = { left: number; top: number; right: number; bottom: number; turn: number };

const ARG = /^(left|top|right|bottom|turn)\s*:\s*(-?\d+(?:\.\d+)?)(%|deg)$/;

export function isCropHelper(source: string): boolean {
	return source.trimStart().startsWith(`#let ${CROP_CALL}(`);
}

export function isCropCall(name: string): boolean {
	return name === CROP_CALL;
}

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
