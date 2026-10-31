// a crop in LaTeX: \includegraphics's trim and clip, in bp, and its angle
import { UNCROPPED, isUncropped } from '$lib/images/crop/cropGeometry';
import { DEFAULT_FIGURE_FRACTION } from '../figureDefaults';
import { cropOfTrim, quarterTurns, readGraphicsCrop, trimOfCrop, writeGraphicsCrop } from './graphicsCrop';
import type { ImageCropFormat } from './imageCropFormat';

function optionsOf(attrs: Record<string, unknown>): string | null {
	return typeof attrs.options === 'string' ? attrs.options : null;
}

export const latexCropFormat: ImageCropFormat = {
	key(node) {
		const { trim, clip, angle } = readGraphicsCrop(optionsOf(node.attrs));
		const cut = clip && trim ? trim.join(' ') : '';
		return cut || angle ? `${cut}|${angle}` : '';
	},
	read(node, size) {
		const { trim, clip, angle } = readGraphicsCrop(optionsOf(node.attrs));
		return { crop: clip ? cropOfTrim(trim, size.w, size.h) : UNCROPPED, turns: quarterTurns(angle) };
	},
	write(node, { crop, turns }, size) {
		// an editor-made image is written at the default width, which a crop keeps
		const options = optionsOf(node.attrs) ?? `width=${DEFAULT_FIGURE_FRACTION}\\textwidth`;
		const { angle } = readGraphicsCrop(options);
		const between = angle - 90 * quarterTurns(angle);
		const trim = isUncropped(crop) ? null : trimOfCrop(crop, size.w, size.h);
		return { ...node.attrs, options: writeGraphicsCrop(options, trim, between + 90 * turns) };
	}
};
