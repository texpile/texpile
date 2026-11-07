import type { PatternTile } from './drawing.types';

// a tile's drawing may cross its cell's edge, as pgf's lines and dots do, and the cells around draw that part
export const TILE_COPIES = [-1, 0, 1].flatMap((i) => [-1, 0, 1].map((j) => [i, j] as const));

export function tileMatrix(tile: PatternTile): string {
	return `matrix(${tile.matrix.join(' ')})`;
}
