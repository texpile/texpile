import { m } from '$lib/paraglide/messages';
import { nodeName } from '../nodes';
import { readPicture, type Picture, type Statement } from '../picture';
import type { SyntaxPart } from '../reader/syntaxParts';
import { escapeRegExp } from '../sourceText';

/** a node's or a point's name, a `\tikzset` style or a macro, which one statement sets and others use */
export type StatementNeed = { kind: 'node' | 'point' | 'style' | 'macro'; name: string };

/** a use the edit breaks: what it needs comes after it, holds only in a group it is not in, or is gone */
export type BrokenNeed = { use: Statement; need: StatementNeed; why: 'first' | 'group' | 'gone' };

const NAME = /^\(\s*([A-Za-z][\w-]*)\s*\)$/;
const COORDINATE = /^\\coordinate\s*(?:\[[^\]]*\]\s*)?\(\s*([A-Za-z][\w-]*)\s*\)/;
const STYLE = /([A-Za-z][\w -]*?)\s*\/\.(?:style|append style|estyle|code|pic)\b/g;
const MACRO = /\\(?:pgfmath(?:set|truncate|setlength)macro|[egx]?def|let|(?:re|provide|new)command\*?)\s*\{?\s*(\\[A-Za-z@]+)/g;

function partNames(text: string, parts: SyntaxPart[], out: Set<string>) {
	for (const p of parts) {
		const named = p.type === 'nodeName' ? p : p.type === 'coordinate' ? p.parts.find((q) => q.type === 'point') : null;
		const m = named && NAME.exec(text.slice(named.from, named.to));
		if (m) out.add(m[1]);
		partNames(text, p.parts, out);
	}
}

/** the names a statement gives its node, itself as a `\\coordinate`, and the coordinates on it */
export function namesGiven(text: string, st: Statement) {
	const out = new Set<string>();
	const own = st.kind === 'node' ? nodeName(text, st) : COORDINATE.exec(text.slice(st.from, st.to))?.[1];
	if (own) out.add(own);
	partNames(text, st.parts, out);
	return out;
}

/** the statement's own spans of text, without the statements inside it */
export function ownSpans(statements: Statement[], st: Statement) {
	const spans: [number, number][] = [];
	let at = st.from;
	for (const inner of statements)
		if (inner !== st && st.from <= inner.from && inner.to <= st.to && inner.from >= at) {
			spans.push([at, inner.from]);
			at = inner.to;
		}
	return [...spans, [at, st.to]];
}

function ownText(source: string, picture: Picture, st: Statement) {
	return ownSpans(picture.statements, st)
		.map(([from, to]) => source.slice(from, to))
		.join('');
}

function setBy(source: string, picture: Picture, st: Statement): StatementNeed[] {
	const text = ownText(source, picture, st);
	const own = st.kind === 'node' ? nodeName(source, st) : null;
	return [
		...[...namesGiven(source, st)].map((name): StatementNeed => ({ kind: name === own ? 'node' : 'point', name })),
		...[...text.matchAll(STYLE)].map((m): StatementNeed => ({ kind: 'style', name: m[1].trim() })),
		...[...text.matchAll(MACRO)].map((m): StatementNeed => ({ kind: 'macro', name: m[1] }))
	];
}

function usesNeed(text: string, need: StatementNeed) {
	const n = escapeRegExp(need.name);
	if (need.kind === 'style') return new RegExp(`[[,{]\\s*${n}\\s*[,\\]=}]`).test(text);
	if (need.kind === 'macro') return new RegExp(`${n}(?![A-Za-z@])`).test(text);
	return new RegExp(`\\(\\s*${n}\\s*[).]|\\bof\\s+${n}\\b`).test(text);
}

function inside(outer: Statement, st: Statement) {
	return outer !== st && outer.from <= st.from && st.to <= outer.to;
}

function readUses(source: string, pictureIndex: number) {
	const picture = readPicture(source, pictureIndex);
	const sets = picture ? picture.statements.flatMap((st) => setBy(source, picture, st).map((need) => ({ st, need }))) : [];
	return { source, picture, sets };
}

/** every use of what `known` names, by a statement other than the one setting it, with whether the picture still
 *  gives it: a name once set holds for the rest of the picture, a style or a macro to the end of the group it is set in */
function uses({ source, picture, sets }: ReturnType<typeof readUses>, known: StatementNeed[]) {
	if (!picture) return [];
	const scopes = picture.statements.filter((s) => s.kind === 'scope');
	return picture.statements.flatMap((use) => {
		const text = ownText(source, picture, use);
		const key = text.replace(/\s+/g, ' ').trim();
		function holds(st: Statement) {
			const group = scopes.filter((s) => inside(s, st)).at(-1);
			return inside(st, use) || !group || inside(group, use);
		}
		return known
			.filter((need) => usesNeed(text, need) && !sets.some((s) => s.st === use && same(s.need, need)))
			.map((need) => {
				const by = sets.filter((s) => same(s.need, need)).map((s) => s.st);
				const before = by.filter((st) => st.from < use.from || inside(st, use));
				const held = need.kind === 'style' || need.kind === 'macro' ? before.filter(holds) : before;
				const why: BrokenNeed['why'] | null = held.length ? null : before.length ? 'group' : by.length ? 'first' : 'gone';
				return { key: `${key}|${need.kind}:${need.name}`, use, need, why };
			});
	});
}

function same(a: StatementNeed, b: StatementNeed) {
	return a.kind === b.kind && a.name === b.name;
}

/** a broken use as the editor says it, `title` being what the statement using it is */
export function brokenNeedText({ need, why }: BrokenNeed, title: string) {
	const what = {
		node: m.figure_need_node({ name: need.name }),
		point: m.figure_need_point({ name: need.name }),
		style: m.figure_need_style({ name: need.name }),
		macro: need.name
	}[need.kind];
	const after = { first: m.figure_need_first(), group: m.figure_need_group({ title }), gone: '' }[why];
	return m.figure_need_uses({ title, what, after });
}

/** the first use the edit from `before` to `after` breaks, one the text before it still met */
export function brokenNeed(before: string, after: string, pictureIndex: number): BrokenNeed | null {
	const [was, now] = [readUses(before, pictureIndex), readUses(after, pictureIndex)];
	const known = [...was.sets, ...now.sets].map((s) => s.need).filter((n, k, all) => all.findIndex((m) => same(m, n)) === k);
	const met = new Set(
		uses(was, known)
			.filter((u) => !u.why)
			.map((u) => u.key)
	);
	const broken = uses(now, known).find((u) => u.why && met.has(u.key));
	return broken ? { use: broken.use, need: broken.need, why: broken.why! } : null;
}
