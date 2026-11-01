import type { FigureLanguage } from '../figure/figureLanguage';

export type EngineFont = {
	id: number;
	name: string;
	file: string;
	size: number;
	harf: boolean;
	t1?: { pfb: string; enc: string | null };
};

export type EngineFileReader = (path: string) => Promise<ArrayBuffer>;

export type FigureEngine = {
	render(job: string): Promise<unknown>;
	abandon?(): void;
	reset?(): void;
	/** the font files the engine used; an engine whose drawing carries its glyphs as outlines needs none */
	readFont?: EngineFileReader;
	/** a URL the page can load an image the engine reported from (PNG or JPEG); without it images show as boxes */
	imageUrl?: (path: string) => string;
};

export type FigureProvider = {
	language: FigureLanguage;
	engine: FigureEngine;
};
