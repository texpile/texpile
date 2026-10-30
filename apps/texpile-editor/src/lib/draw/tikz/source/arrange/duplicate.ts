import { shiftStatement } from '../moves/statementMoves';
import { nodeName } from '../nodes';
import { listPictures, readPicture, type Statement } from '../picture';
import { escapeRegExp, indentAt } from '../sourceText';

/** the statement's text without the node's name, so the name still means one node */
function unnamedCopy(source: string, st: Statement) {
	const copy = source.slice(st.from, st.to);
	const name = st.kind === 'node' ? nodeName(source, st) : null;
	if (!name) return copy;
	const n = escapeRegExp(name);
	return copy.replace(new RegExp(`\\s*\\(\\s*${n}\\s*\\)|name\\s*=\\s*${n}\\b\\s*,\\s*|,?\\s*name\\s*=\\s*${n}\\b`), '');
}

/** a copy on the line after the original, moved by (du, dv) in the coordinates it starts in, `page` cm on the page */
export function duplicateStatement(source: string, st: Statement, du: number, dv: number, page?: [number, number]) {
	const indent = indentAt(source, st.from);
	// the original keeps the comment after it, which names it in the objects list
	const end = st.to + (/^[ \t]*%[^\n]*/.exec(source.slice(st.to))?.[0].length ?? 0);
	const next = `${source.slice(0, end)}\n${indent}${unnamedCopy(source, st)}${source.slice(end)}`;
	const at = end + 1 + indent.length;
	const k = listPictures(next).findIndex((p) => p.from <= at && at < p.to);
	const made = readPicture(next, k)?.statements.find((c) => c.from === at);
	return made ? shiftStatement(next, made, du, dv, page) : next;
}
