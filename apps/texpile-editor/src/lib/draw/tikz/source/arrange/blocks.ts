import type { Picture, Statement } from '../picture';
import { indentAt, lineEnd, lineStart } from '../sourceText';

/** one more level than `indent`: a tab when the picture is indented with tabs */
export function deeper(source: string, picture: Picture, indent: string) {
	const tabs = picture.statements.some((s) => indentAt(source, s.from).includes('\t'));
	return indent + (tabs ? '\t' : '  ');
}

/** where a comment on the statement's first line starts, when it is the statement's own: nothing else between */
function labelComment(source: string, st: Statement) {
	const end = lineEnd(source, st.from);
	const rest = source.slice(st.from, end);
	const at = rest.search(/(?<!\\)%/);
	if (at < 0) return null;
	const from = st.from + at;
	if (st.to <= end && (from < st.to || source.slice(st.to, from).trim() !== '')) return null;
	return { from, to: end };
}

/** the statement's label: the comment that follows it on its first line */
export function readLabel(source: string, st: Statement) {
	const c = labelComment(source, st);
	return c ? source.slice(c.from + 1, c.to).trim() || null : null;
}

export function writeLabel(source: string, st: Statement, label: string) {
	const text = label.replace(/\s+/g, ' ').trim();
	const c = labelComment(source, st);
	if (c) {
		const from = text ? c.from : c.from - /[ \t]*$/.exec(source.slice(0, c.from))![0].length;
		return source.slice(0, from) + (text ? `% ${text}` : '') + source.slice(c.to);
	}
	if (!text) return source;
	const end = lineEnd(source, st.from);
	const at = st.to <= end ? st.to : end;
	const rest = source.slice(at, end);
	// the comment would hide what follows it on the line, so that goes on a line of its own
	if (rest.trim()) return `${source.slice(0, at)} % ${text}\n${indentAt(source, st.from)}${source.slice(at).trimStart()}`;
	return `${source.slice(0, at)} % ${text}${source.slice(at)}`;
}

/** the statement with its label: what moves when it moves */
export function slotOf(source: string, st: Statement) {
	const c = st.to <= lineEnd(source, st.from) ? labelComment(source, st) : null;
	if (c) return { from: st.from, to: c.to };
	const end = lineEnd(source, st.to);
	return /^[ \t]*(?<!\\)%/.test(source.slice(st.to, end)) ? { from: st.from, to: end } : { from: st.from, to: st.to };
}

/** the slot, and the lines it stands alone on when it does: what goes when it is taken out */
export function extentOf(source: string, st: Statement) {
	const slot = slotOf(source, st);
	const start = lineStart(source, slot.from);
	const end = lineEnd(source, slot.to);
	const alone = source.slice(start, slot.from).trim() === '' && source.slice(slot.to, end).trim() === '';
	if (alone) return { slot, from: start, to: Math.min(end + 1, source.length), alone };
	const after = /^[ \t]?/.exec(source.slice(slot.to))![0].length;
	return { slot, from: slot.from, to: slot.to + after, alone };
}

/** the slot's text with its later lines moved from one indent to another */
export function reindent(text: string, from: string, to: string) {
	return text
		.split('\n')
		.map((line, k) => (k === 0 ? line : line.startsWith(from) ? to + line.slice(from.length) : line))
		.join('\n');
}

/** a statement alone on its line takes the line with it, and its label */
export function removeStatement(source: string, st: Statement) {
	const { from, to } = extentOf(source, st);
	return source.slice(0, from) + source.slice(to);
}
