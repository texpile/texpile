// the tablex package's table: its own functions for lines, cells and spans, and the lines it draws by itself
import {
	namedArg,
	positionalArgs,
	readTypstCall,
	withoutTrailingLabel,
	type CallArg,
	type TypstCall
} from '$lib/languages/typst/visual/core/document';
import { columnsOf, whole, type TableRead, type TableWords } from './tableCall';

// written with or without the module's name before it
function lastName(call: TypstCall): string {
	return call.name.split('.').pop() ?? '';
}

/** the package's two tables, by the name a call is written with */
export function isTablexName(name: string): boolean {
	return /(?:^|\.)(?:tablex|gridx)$/.test(name);
}

function tablexWords(arg: CallArg): ReturnType<TableWords> {
	// tablex has `()` written in each place a span covers
	if (arg.kind !== 'FuncCall') return arg.value.replace(/\s/g, '') === '()' ? 'skip' : null;
	const call = readTypstCall(`#${arg.value}`);
	if (call?.form !== 'call') return null;
	const name = lastName(call);
	if (name === 'hlinex' || name === 'vlinex') return { kind: name === 'hlinex' ? 'hline' : 'vline', call, colspan: 1, rowspan: 1 };
	if (name === 'cellx')
		return { kind: 'cell', call, colspan: whole(namedArg(call, 'colspan')) ?? 1, rowspan: whole(namedArg(call, 'rowspan')) ?? 1 };
	if (name !== 'colspanx' && name !== 'rowspanx') return null;
	const span = whole(positionalArgs(call)[0] ?? null) ?? 1;
	return { kind: 'cell', call, colspan: name === 'colspanx' ? span : 1, rowspan: name === 'rowspanx' ? span : 1 };
}

function flag(call: TypstCall, name: string): boolean | null {
	const given = namedArg(call, name);
	return given?.kind === 'Bool' ? given.value === 'true' : null;
}

export function readTablex(source: string): TableRead | null {
	const written = source.trim();
	const call = readTypstCall(withoutTrailingLabel(written));
	if (call?.form !== 'call' || !isTablexName(call.name)) return null;
	const name = lastName(call);
	const cols = columnsOf(call);
	if (!cols) return null;
	// gridx is tablex with no lines of its own
	const all = flag(call, 'auto-lines') ?? name === 'tablex';
	const auto = { rows: flag(call, 'auto-hlines') ?? all, columns: flag(call, 'auto-vlines') ?? all };
	return { call, source: written, cols, words: tablexWords, auto };
}
