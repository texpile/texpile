// a chip that is one call of an element with cells and lines of its own (`table`, `grid`)
import { columnCount, namedArg, type CallArg, readStdUse, type StdUse } from '$lib/languages/typst/visual/core/document';

export function whole(arg: CallArg | null): number | null {
	return arg?.kind === 'Int' ? Number.parseInt(arg.value, 10) : null;
}

/** a chip that is one call of an element with cells and lines of its own (`table`, `grid`) */
export function readTable(source: string): { use: StdUse; cols: number } | null {
	const use = readStdUse(source);
	const scope = use?.entry.scope;
	if (!use || !scope || !['cell', 'hline', 'vline'].every((member) => Object.hasOwn(scope, member))) return null;
	const columns = namedArg(use.call, 'columns');
	const cols = columns ? columnCount(columns.node, use.call.source) : 1;
	return cols ? { use, cols } : null;
}
