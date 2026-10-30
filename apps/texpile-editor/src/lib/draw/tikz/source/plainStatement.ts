import type { StatementKind } from '$lib/draw/editor/figure/figureLanguage';
import type { Statement } from './picture';

export type Unnumbered = Omit<Statement, 'i'>;

/** a statement read apart, with no parts of its own: pgfplots', tikz-cd's and forest's */
export function plainStatement(from: number, to: number, kind: StatementKind, command: string, inScope: boolean): Unnumbered {
	return { from, to, kind, command, inScope, parts: [], body: [] };
}
