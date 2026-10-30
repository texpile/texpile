import type { Matrix } from './matrix';

type Painted = {
	/** the statement that drew it, 0 for the picture's own setup */
	stmt: number;
	/** drawn for the statement but outside its box: a tree node's edge from its parent */
	apart?: boolean;
	clip: string | null;
	/** how it mixes with what is under it, as CSS's mix-blend-mode names it; absent for normal */
	blend?: string;
};

export type DrawnPath = Painted & {
	kind: 'path';
	d: string;
	fill: string | null;
	/** a shading: the id of the gradient that fills it */
	gradient: string | null;
	fillOpacity: number;
	evenOdd: boolean;
	stroke: string | null;
	strokeWidth: number;
	strokeOpacity: number;
	dash: string | null;
	/** where the dash pattern starts along the path, PDF's phase */
	dashOffset: number;
	cap: 'butt' | 'round' | 'square';
	join: 'miter' | 'round' | 'bevel';
};

export type DrawnGlyph = Painted & {
	kind: 'glyph';
	font: number;
	code: number;
	gi?: number;
	/** places the glyph's outline, drawn y down at the font size in bp */
	matrix: Matrix;
	fill: string;
	opacity: number;
};

export type DrawnImage = Painted & {
	kind: 'image';
	/** the image file, as the engine reported it */
	path: string;
	/** places the unit square, its top left at 0,0, where the engine put the image */
	matrix: Matrix;
	opacity: number;
};

export type DrawnPart = DrawnPath | DrawnGlyph | DrawnImage;

export type ClipRegion = { id: string; d: string; evenOdd: boolean; parent: string | null };

/** in the shading box's own coordinates, placed by `transform` */
export type Gradient = {
	id: string;
	/** hatch: a pgf pattern, drawn as north east lines in its color whatever its tile */
	kind: 'linear' | 'radial' | 'hatch';
	from: [number, number];
	to: [number, number];
	radius: number;
	/** where a radial shading's inner circle sits */
	focus: [number, number];
	transform: number[];
	stops: { offset: number; color: string }[];
};

/** everything in bp, y up, origin at pgf's origin */
export type Drawing = {
	parts: DrawnPart[];
	clips: ClipRegion[];
	gradients: Gradient[];
	bbox: { x: number; y: number; w: number; h: number };
	/** what this renderer does not draw, such as a PDF image (drawn as its box) */
	unsupported: string[];
};
