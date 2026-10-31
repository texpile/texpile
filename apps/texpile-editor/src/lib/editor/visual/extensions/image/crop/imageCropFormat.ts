// how a dialect holds an image's crop and turn in its source, for the paper to draw and the cropper to write
import type { Node as PMNode } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import type { Crop } from '$lib/images/crop/cropGeometry';

/** the crop of the image before its turn, as fractions of each side, and its quarter turns counterclockwise */
export type ImageCrop = { crop: Crop; turns: number };

/** the image's size as its typesetter reads it, in bp */
export type ImageSize = { w: number; h: number };

export type ImageCropFormat = {
	/** what the crop and turn are written as, '' for an image with neither; the paper redraws when it changes */
	key(node: PMNode): string;
	read(node: PMNode, size: ImageSize): ImageCrop;
	/** the node's attrs with `crop` written in */
	write(node: PMNode, crop: ImageCrop, size: ImageSize): Record<string, unknown>;
	/** what else the document needs for the crop, added in the same step */
	prepare?(tr: Transaction): void;
};
