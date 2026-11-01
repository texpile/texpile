import type { TextSpan } from '$lib/draw/editor/figure/figureLanguage';

export type CdArrowSpan = TextSpan & { options: TextSpan; items: string[] };
export type CdCell = TextSpan & { r: number; c: number; text: TextSpan | null; arrows: CdArrowSpan[] };
export type CdGrid = {
	options: TextSpan | null;
	bodyFrom: number;
	separator: string;
	endFrom: number;
	rows: CdCell[][];
};
