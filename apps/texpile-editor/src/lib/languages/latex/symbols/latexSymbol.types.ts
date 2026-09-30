import type { LatexSymbolGroup } from './latexSymbolGroups';

/** where a symbol can be written: in running text, in math, or in either */
export type LatexSymbolMode = 'text' | 'math' | 'both';

export type LatexSymbol = {
	/** Detexify's id, `amssymb-OT1-_subsetneq`: package, font encoding and command, unique across the table */
	id: string;
	/** as written, `\subsetneq`, `\mathbb{R}` */
	command: string;
	/** the package it needs, '' when the kernel has it */
	package: string;
	/** the font encoding it needs, '' when the default one has it */
	fontenc: string;
	mode: LatexSymbolMode;
	group: LatexSymbolGroup;
	/** where LaTeX's drawing of it sits in latexSymbols.png, or the Unicode letter it is shown as */
	picture: { x: number; y: number; width: number; height: number } | { letter: string };
};
