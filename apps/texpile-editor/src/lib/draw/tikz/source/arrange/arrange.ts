import { deeper, extentOf, reindent, slotOf } from './blocks';
import { applyTextEdits, indentAt, lineEnd, lineStart, type TextEdit } from '../sourceText';
import type { ArrangeTarget, Arranged } from '$lib/draw/editor/figure/figureLanguage';
import type { Picture, Statement } from '../picture';

const END_SCOPE = '\\end{scope}';

export function parentOf(picture: Picture, st: Statement) {
	let found: Statement | null = null;
	for (const s of picture.statements)
		if (s !== st && s.kind === 'scope' && s.from <= st.from && st.to <= s.to && (!found || s.from >= found.from)) found = s;
	return found;
}

function axisOf(picture: Picture, st: Statement) {
	return picture.statements.find((s) => s !== st && s.kind === 'axis' && s.from <= st.from && st.to <= s.to) ?? null;
}

function outermost(statements: Statement[]) {
	return statements.filter((s) => !statements.some((o) => o !== s && o.from <= s.from && s.to <= o.to)).sort((a, b) => a.from - b.from);
}

function blockOf(source: string, st: Statement) {
	const slot = slotOf(source, st);
	return { text: source.slice(slot.from, slot.to), indent: indentAt(source, slot.from) };
}

function asLines(blocks: { text: string; indent: string }[], indent: string) {
	let insert = '';
	const marks: number[] = [];
	for (const b of blocks) {
		marks.push(insert.length + indent.length);
		insert += `${indent}${reindent(b.text, b.indent, indent)}\n`;
	}
	return { text: insert, marks };
}

function inline(blocks: { text: string }[], before: string, after: string) {
	let insert = before;
	const marks: number[] = [];
	blocks.forEach((b, k) => {
		if (k) insert += ' ';
		marks.push(insert.length);
		insert += b.text;
	});
	return { text: insert + after, marks };
}

function placeAt(
	source: string,
	picture: Picture,
	target: Statement,
	to: ArrangeTarget,
	blocks: { text: string; indent: string }[]
): TextEdit {
	if ('into' in to) {
		const endFrom = source.lastIndexOf('\\end{', target.to);
		const children = picture.statements.filter((s) => parentOf(picture, s) === target);
		const indent = children.length ? indentAt(source, children.at(-1)!.from) : deeper(source, picture, indentAt(source, target.from));
		const start = lineStart(source, endFrom);
		if (source.slice(start, endFrom).trim() === '') return { from: start, to: start, ...asLines(blocks, indent) };
		return { from: endFrom, to: endFrom, ...inline(blocks, '', ' ') };
	}
	const indent = indentAt(source, target.from);
	if ('before' in to) {
		const start = lineStart(source, target.from);
		if (source.slice(start, target.from).trim() === '') return { from: start, to: start, ...asLines(blocks, indent) };
		return { from: target.from, to: target.from, ...inline(blocks, '', ' ') };
	}
	const slot = slotOf(source, target);
	const end = lineEnd(source, slot.to);
	if (source.slice(slot.to, end).trim() !== '') return { from: slot.to, to: slot.to, ...inline(blocks, ' ', '') };
	if (end === source.length) {
		const lines = asLines(blocks, indent);
		return { from: end, to: end, text: `\n${lines.text.slice(0, -1)}`, marks: lines.marks.map((m) => m + 1) };
	}
	return { from: end + 1, to: end + 1, ...asLines(blocks, indent) };
}

export function moveStatements(source: string, picture: Picture, ids: number[], to: ArrangeTarget): Arranged | null {
	const moved = outermost(picture.statements.filter((s) => ids.includes(s.i)));
	const ref = 'into' in to ? to.into : 'before' in to ? to.before : to.after;
	const target = picture.statements.find((s) => s.i === ref);
	if (!moved.length || !target || moved.some((m) => m.from <= target.from && target.to <= m.to)) return null;
	if ('into' in to && target.kind !== 'scope') return null;
	if (moved.some((m) => axisOf(picture, m) !== axisOf(picture, target))) return null;
	const removals = moved.map((s): TextEdit => ({ ...extentOf(source, s), text: '' }));
	const place = placeAt(
		source,
		picture,
		target,
		to,
		moved.map((s) => blockOf(source, s))
	);
	return applyTextEdits(source, [...removals, place]);
}

export function groupStatements(source: string, picture: Picture, ids: number[]): Arranged | null {
	const grouped = outermost(picture.statements.filter((s) => ids.includes(s.i) && s.kind !== 'frame'));
	if (!grouped.length) return null;
	const parent = parentOf(picture, grouped[0]);
	if (grouped.some((s) => parentOf(picture, s) !== parent)) return null;
	const last = grouped.at(-1)!;
	const indent = indentAt(source, last.from);
	const inner = deeper(source, picture, indent);
	const body = grouped.map((s) => {
		const b = blockOf(source, s);
		return inner + reindent(b.text, b.indent, inner);
	});
	const slot = slotOf(source, last);
	const scope = `\\begin{scope}\n${body.join('\n')}\n${indent}${END_SCOPE}`;
	const removals = grouped.slice(0, -1).map((s): TextEdit => ({ ...extentOf(source, s), text: '' }));
	return applyTextEdits(source, [...removals, { from: slot.from, to: slot.to, text: scope, marks: [0] }]);
}

export function ungroupStatement(source: string, picture: Picture, id: number): Arranged | null {
	const scope = picture.statements.find((s) => s.i === id && s.kind === 'scope');
	if (!scope || /^\\begin\{scope\}\s*\[/.test(source.slice(scope.from, scope.to))) return null;
	const children = picture.statements.filter((s) => parentOf(picture, s) === scope);
	const indent = indentAt(source, scope.from);
	if (!children.length) {
		const { from, to } = extentOf(source, scope);
		return { source: source.slice(0, from) + source.slice(to), at: [] };
	}
	let insert = '';
	const marks: number[] = [];
	children.forEach((c, k) => {
		const b = blockOf(source, c);
		if (k) insert += `\n${indent}`;
		marks.push(insert.length);
		insert += reindent(b.text, b.indent, indent);
	});
	const slot = slotOf(source, scope);
	return applyTextEdits(source, [{ from: slot.from, to: slot.to, text: insert, marks }]);
}
