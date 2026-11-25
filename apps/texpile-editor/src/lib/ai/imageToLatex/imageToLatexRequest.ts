// The picture the Convert to LaTeX dialog is open for, and where its answer goes
import { box } from '$lib/runes/box.svelte';
import type { ImageDialect } from './imagePrompt';

/** the open file, and the place in it a drawing's preview compiles with */
export type PreviewPlace = { path: string; root: string; text: string; at: number };

export type ImageToLatexTarget = {
	dialect: ImageDialect;
	place: () => Promise<PreviewPlace | null>;
	insert: (source: string) => void;
};

/** whether a large picture, such as a scan or a PDF page, waits for the writer to pick the part to read; a paste never does */
export type RegionFirst = 'large' | 'never';

export type ImageToLatexRequest = { target: ImageToLatexTarget; picture: { blob: Blob; regionFirst: RegionFirst } };

export const imageToLatexRequest = box<ImageToLatexRequest | null>(null);
