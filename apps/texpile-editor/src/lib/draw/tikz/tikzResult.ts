import type { EngineFont } from '$lib/draw/editor/provider/figureEngine';

export type { EngineFont };

/** one thing the typeset box holds, in TeX pt from the box's reference point, y down */
export type EngineRecord =
	| { t: 'l'; x: number; y: number; d: string }
	| { t: 'g'; x: number; y: number; c: number; f: number; gi?: number }
	| { t: 'r'; x: number; y: number; w: number; h: number; d: number }
	| { t: 'c'; cmd: number; d: string }
	/** a saved box placed here (pgf's shadings), `n` its resource index */
	| { t: 'x'; n: number; x: number; y: number; w: number; h: number; d: number }
	/** an included image; `p` its file, absolute once the engine returns */
	| { t: 'i'; n: number; x: number; y: number; w: number; h: number; d: number; p?: string }
	| { t: 'm'; i: number }
	/** a transparency group begins (1) or ends (0); its contents sit in between */
	| { t: 'G'; on: 0 | 1 };

/** pgf's transform and unit vectors at \tikzcapmark{i} or `tikzcap transform=i`; i < 0 is an editor measure */
export type StatementMark = {
	i: number;
	m: [number, number, number, number, number, number, number, number, number, number];
	/** from the key, once the statement's own options apply */
	own?: boolean;
};

export type EngineResult = {
	ms: number;
	/** the picture left a group open, and the engine that drew it is not used again */
	stop: boolean;
	w: number;
	h: number;
	d: number;
	marks: StatementMark[];
	recs: EngineRecord[];
	fonts: EngineFont[];
	shadings: Record<string, { kind: 'h' | 'v' | 'r'; domain: string; func: string; focus: [number, number] | null }>;
	errors: string[];
	errorLines?: (number | null)[];
};
