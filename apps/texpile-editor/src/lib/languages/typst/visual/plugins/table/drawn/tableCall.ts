// a chip that is one call of an element with cells and lines of its own: `table`, `grid`, or the tablex package's
import {
	columnCount,
	namedArg,
	readStdUse,
	readTypstCall,
	type CallArg,
	type StdUse,
	type TypstCall
} from '$lib/languages/typst/visual/core/document';
import { readTablex } from './tablexWords';

/** `cells` holds cells of its own, as a header does */
export type TableMember = { kind: 'cell' | 'hline' | 'vline' | 'cells'; call: TypstCall; colspan: number; rowspan: number };

/** what an argument is when it is more than a cell's content; `skip` for the place tablex writes under a span */
export type TableWords = (arg: CallArg, table: TypstCall) => TableMember | 'skip' | null;

export type TableRead = {
	call: TypstCall;
	source: string;
	cols: number;
	words: TableWords;
	/** the lines the table draws by itself; null where its cells carry the stroke */
	auto: { rows: boolean; columns: boolean } | null;
};

export function whole(arg: CallArg | null): number | null {
	return arg?.kind === 'Int' ? Number.parseInt(arg.value, 10) : null;
}

function stdWords(use: StdUse): TableWords {
	const scope = use.entry.scope ?? {};
	return (arg, table) => {
		if (arg.kind !== 'FuncCall') return null;
		const call = readTypstCall(`#${arg.value}`);
		const prefix = `${table.name}.`;
		const member = call?.form === 'call' && call.name.startsWith(prefix) ? call.name.slice(prefix.length) : '';
		if (!call || !member || !Object.hasOwn(scope, member)) return null;
		if (member === 'hline' || member === 'vline') return { kind: member, call, colspan: 1, rowspan: 1 };
		if (member !== 'cell') return { kind: 'cells', call, colspan: 1, rowspan: 1 };
		return { kind: 'cell', call, colspan: whole(namedArg(call, 'colspan')) ?? 1, rowspan: whole(namedArg(call, 'rowspan')) ?? 1 };
	};
}

export function columnsOf(call: TypstCall): number | null {
	const columns = namedArg(call, 'columns');
	return columns ? columnCount(columns.node, call.source) : 1;
}

export function readTable(source: string): TableRead | null {
	const use = readStdUse(source);
	const scope = use?.entry.scope;
	if (!use || !scope || !['cell', 'hline', 'vline'].every((member) => Object.hasOwn(scope, member))) return readTablex(source);
	const cols = columnsOf(use.call);
	return cols ? { call: use.call, source: use.source, cols, words: stdWords(use), auto: null } : null;
}
