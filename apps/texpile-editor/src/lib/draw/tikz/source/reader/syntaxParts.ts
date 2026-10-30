import type { StatementKind } from '$lib/draw/editor/figure/figureLanguage';

/**
 * What a statement is written with, each with its span:
 * options `[...]`, a point `(...)`, `+`/`++` before one, an operator (`--`, `..`), a keyword (`at`, `circle`), a
 * node's text, a group `{...}`, and the operations that hold parts of their own: a node on a path, its `at`, `to`
 * and `edge` with their target, a pic, a let, a child, a loop on the path; `word` is anything else
 */
export type PartType =
	| 'options'
	| 'point'
	| 'relative'
	| 'prefix'
	| 'operator'
	| 'keyword'
	| 'text'
	| 'group'
	| 'node'
	| 'nodeName'
	| 'placement'
	| 'to'
	| 'edge'
	| 'target'
	| 'coordinate'
	| 'pic'
	| 'let'
	| 'child'
	| 'operation'
	| 'loop'
	| 'word';

export type SyntaxPart = { type: PartType; from: number; to: number; parts: SyntaxPart[] };

/** a statement as read, before the picture numbers it; a scope's or a loop's own statements are its body */
export type ReadStatement = {
	from: number;
	to: number;
	kind: StatementKind;
	/** `\draw`, `\node`, ... or '' */
	command: string;
	parts: SyntaxPart[];
	body: ReadStatement[];
};

export function partOf(parts: SyntaxPart[], type: PartType) {
	return parts.find((p) => p.type === type) ?? null;
}
