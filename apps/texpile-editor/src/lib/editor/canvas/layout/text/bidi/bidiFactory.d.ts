// the members of bidi-js 1.1.0's declarations the canvas calls (see README.md)
export type EmbeddingLevels = {
	levels: Uint8Array;
	paragraphs: { start: number; end: number; level: number }[];
};

export type Bidi = {
	getEmbeddingLevels(text: string, baseDirection?: 'ltr' | 'rtl' | 'auto'): EmbeddingLevels;
	getReorderSegments(text: string, embeddingLevels: EmbeddingLevels, start?: number, end?: number): number[][];
	getMirroredCharactersMap(text: string, embeddingLevels: Uint8Array, start?: number, end?: number): Map<number, string>;
};

// eslint-disable-next-line no-restricted-exports -- bidi-js's one export
export default function bidiFactory(): Bidi;
