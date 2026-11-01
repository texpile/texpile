import type { StatementKind } from '$lib/draw/editor/figure/figureLanguage';

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

export type ReadStatement = {
	from: number;
	to: number;
	kind: StatementKind;
	command: string;
	parts: SyntaxPart[];
	body: ReadStatement[];
};

export function partOf(parts: SyntaxPart[], type: PartType) {
	return parts.find((p) => p.type === type) ?? null;
}
