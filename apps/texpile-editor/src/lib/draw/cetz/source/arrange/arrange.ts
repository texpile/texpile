import type { Arranged, ArrangeTarget } from '$lib/draw/editor/figure/figureLanguage';
import type { CetzPicture, CetzStatement } from '../picture';

function lineStart(source: string, pos: number) {
	return source.lastIndexOf('\n', pos - 1) + 1;
}

function lineEnd(source: string, pos: number) {
	const nl = source.indexOf('\n', pos);
	return nl < 0 ? source.length : nl;
}

/** the statement with its whole line when it stands alone on it, its label comment included */
function block(source: string, st: CetzStatement) {
	const from = lineStart(source, st.from);
	const to = lineEnd(source, st.to);
	const alone = source.slice(from, st.from).trim() === '' && /^\s*(\/\/.*)?$/.test(source.slice(st.to, to));
	return alone
		? { from, to: Math.min(to + 1, source.length), text: source.slice(st.from, to).trimEnd() }
		: { from: st.from, to: st.to, text: source.slice(st.from, st.to) };
}

function parentOf(picture: CetzPicture, st: CetzStatement) {
	return picture.statements.filter((s) => s.kind === 'scope' && s !== st && s.from <= st.from && st.to <= s.to).at(-1) ?? null;
}

function outermost(statements: CetzStatement[]) {
	return statements.filter((s) => !statements.some((o) => o !== s && o.from <= s.from && s.to <= o.to));
}

/** where a block goes: a line of its own before or after a statement, or last in a group's body */
function slot(source: string, picture: CetzPicture, target: CetzStatement, to: ArrangeTarget) {
	if ('into' in to) {
		const close = source.lastIndexOf('}', target.close);
		const indent = /^[ \t]*/.exec(source.slice(lineStart(source, target.from)))![0];
		return { at: lineStart(source, close), indent: `${indent}  ` };
	}
	const indent = /^[ \t]*/.exec(source.slice(lineStart(source, target.from)))![0];
	const at = 'before' in to ? lineStart(source, target.from) : Math.min(lineEnd(source, target.to) + 1, source.length);
	return { at, indent };
}

/** what removing `blocks` takes from the text before `at` */
function removedBefore(blocks: { from: number; to: number }[], at: number) {
	return blocks.filter((b) => b.to <= at).reduce((n, b) => n + b.to - b.from, 0);
}

function withoutBlocks(source: string, blocks: { from: number; to: number }[]) {
	return [...blocks].sort((a, b) => b.from - a.from).reduce((out, b) => out.slice(0, b.from) + out.slice(b.to), source);
}

/** where each line of `texts` starts once they are written from `at`, each after `indent` */
function starts(at: number, indent: string, texts: string[]) {
	let next = at;
	return texts.map((t) => {
		const here = next + indent.length;
		next = here + t.length + 1;
		return here;
	});
}

/** taken out and put back beside another statement, or last in a group, in the order they are written */
export function moveStatements(source: string, picture: CetzPicture, ids: number[], to: ArrangeTarget): Arranged | null {
	const moved = outermost(picture.statements.filter((s) => ids.includes(s.i)));
	const ref = 'into' in to ? to.into : 'before' in to ? to.before : to.after;
	const target = picture.statements.find((s) => s.i === ref);
	if (!moved.length || !target || moved.some((m) => m.from <= target.from && target.to <= m.to)) return null;
	if ('into' in to && target.kind !== 'scope') return null;
	const place = slot(source, picture, target, to);
	const blocks = moved.map((s) => block(source, s));
	const texts = blocks.map((b) => b.text);
	const at = place.at - removedBefore(blocks, place.at);
	const rest = withoutBlocks(source, blocks);
	const out = rest.slice(0, at) + texts.map((t) => `${place.indent}${t}\n`).join('') + rest.slice(at);
	return { source: out, at: starts(at, place.indent, texts) };
}

/** wrapped in a `group` where the last of them was; null unless they share a parent */
export function groupStatements(source: string, picture: CetzPicture, ids: number[]): Arranged | null {
	const grouped = outermost(picture.statements.filter((s) => ids.includes(s.i) && s.kind !== 'frame'));
	if (!grouped.length || grouped.some((s) => parentOf(picture, s) !== parentOf(picture, grouped[0]))) return null;
	const indent = /^[ \t]*/.exec(source.slice(lineStart(source, grouped.at(-1)!.from)))![0];
	const blocks = grouped.map((s) => block(source, s));
	const text = `${indent}${picture.prefix}group({\n${blocks.map((b) => `${indent}  ${b.text}`).join('\n')}\n${indent}})\n`;
	const last = blocks.at(-1)!;
	const at = lineStart(source, last.from) - removedBefore(blocks.slice(0, -1), last.from);
	const rest = withoutBlocks(source, blocks);
	return { source: rest.slice(0, at) + text + rest.slice(at), at: [at + indent.length] };
}

/** a group's statements in its place, unless it is given anything besides its body */
export function ungroupStatement(source: string, picture: CetzPicture, id: number): Arranged | null {
	const group = picture.statements.find((s) => s.i === id && s.kind === 'scope' && s.command === 'group');
	if (!group || group.args.length !== 1) return null;
	const children = picture.statements.filter((s) => parentOf(picture, s) === group);
	const indent = /^[ \t]*/.exec(source.slice(lineStart(source, group.from)))![0];
	const texts = children.map((c) => block(source, c).text);
	const b = block(source, group);
	const from = lineStart(source, b.from);
	const out = source.slice(0, from) + texts.map((t) => `${indent}${t}\n`).join('') + source.slice(b.to);
	return { source: out, at: starts(from, indent, texts) };
}

/** a name the user gave the statement: the `//` comment after it on its line */
export function readLabel(source: string, st: CetzStatement) {
	const m = /^[ \t]*\/\/\s*(.*?)\s*$/.exec(source.slice(st.to, lineEnd(source, st.to)));
	return m ? m[1] || null : null;
}

export function writeLabel(source: string, st: CetzStatement, label: string) {
	const end = lineEnd(source, st.to);
	const rest = source.slice(st.to, end);
	const kept = /^[ \t]*\/\//.test(rest) ? '' : rest;
	return source.slice(0, st.to) + (label.trim() ? ` // ${label.trim()}` : '') + kept + source.slice(end);
}
