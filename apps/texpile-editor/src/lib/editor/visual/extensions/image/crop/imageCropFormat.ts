import type { Node as PMNode } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import type { Crop } from '$lib/images/crop/cropGeometry';

export type ImageCrop = { crop: Crop; turns: number };

/** size in bp as the typesetter reads it; `orientation` is EXIF's, applied by the browser and not by TeX */
export type ImageSize = { w: number; h: number; orientation?: number };

export type ImageCropFormat = {
	key(node: PMNode): string;
	read(node: PMNode, size: ImageSize): ImageCrop;
	write(node: PMNode, crop: ImageCrop, size: ImageSize): Record<string, unknown>;
	prepare?(tr: Transaction): void;
};
