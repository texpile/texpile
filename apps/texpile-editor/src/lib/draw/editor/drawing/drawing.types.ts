import type { Matrix } from './matrix';

type Painted = {
	/** the statement that drew it, 0 for the picture's own setup */
	stmt: number;
	/** drawn for the statement but outside its box: a tree node's edge from its parent */
	apart?: boolean;
	clip: string | null;
	blend?: string;
};

export type DrawnPath = Painted & {
	kind: 'path';
	d: string;
	fill: string | null;
	gradient: string | null;
	fillOpacity: number;
	evenOdd: boolean;
	stroke: string | null;
	strokeWidth: number;
	strokeOpacity: number;
	dash: string | null;
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
	path: string;
	/** places the unit square, its top left at 0,0, where the engine put the image */
	matrix: Matrix;
	opacity: number;
};

export type DrawnPart = DrawnPath | DrawnGlyph | DrawnImage;

export type ClipRegion = { id: string; d: string; evenOdd: boolean; parent: string | null };

export type TilePath = {
	d: string;
	fill: string | null;
	stroke: string | null;
	strokeWidth: number;
	evenOdd: boolean;
	cap: DrawnPath['cap'];
	join: DrawnPath['join'];
};

/** repeated every width by height in pattern space, which `matrix` places in the picture */
export type PatternTile = { width: number; height: number; matrix: number[]; paths: TilePath[] };

/** in the shading box's own coordinates, placed by `transform`; a pattern is its tile */
export type Gradient = {
	id: string;
	kind: 'linear' | 'radial' | 'pattern';
	tile?: PatternTile;
	from: [number, number];
	to: [number, number];
	radius: number;
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
	unsupported: string[];
};
