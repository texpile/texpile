import type { TextSpan } from '$lib/draw/editor/figure/figureLanguage';

/** `\arrow[...]` or `\ar[...]`; `options` is inside the brackets */
export type CdArrowSpan = TextSpan & { options: TextSpan; items: string[] };
/** a cell between its `&`s, 1-based; `text` is what it shows, the arrows drawn from it apart */
export type CdCell = TextSpan & { r: number; c: number; text: TextSpan | null; arrows: CdArrowSpan[] };
export type CdGrid = {
	/** the environment's own `[...]`, brackets included */
	options: TextSpan | null;
	bodyFrom: number;
	/** what parts cells: `&`, or what `ampersand replacement` puts for it */
	separator: string;
	endFrom: number;
	rows: CdCell[][];
};
