import { m } from '$lib/paraglide/messages';
import { nameArg } from '../nodes/nodeNames';
import { readPicture, type CetzPicture, type CetzStatement } from '../picture';

/** an element's name, the `import draw: *` that lets the picture call draw functions bare, or a `let` variable */
export type StatementNeed = { kind: 'name' | 'import' | 'variable'; name: string };

/** a use the edit breaks: what it needs comes after it, holds only in a group it is not in, or is gone */
export type BrokenNeed = { use: CetzStatement; need: StatementNeed; why: 'first' | 'group' | 'gone' };

const DRAW = new Set([
	'line',
	'rect',
	'circle',
	'arc',
	'bezier',
	'bezier-through',
	'catmull',
	'hobby',
	'grid',
	'polygon',
	'n-star',
	'mark',
	'content',
	'group',
	'scope',
	'on-layer',
	'anchor',
	'set-style',
	'set-origin',
	'set-viewport',
	'translate',
	'rotate',
	'scale',
	'hide',
	'floating',
	'intersections',
	'merge-path'
]);
const IMPORT = { kind: 'import', name: 'draw' } as const;
const NAME_ARG = /^"([^".]+)"$/;
const LET = /^let\s+(?:\(([^)]*)\)|([A-Za-z_][\w-]*))/;
const STRING = /"(?:[^"\\]|\\.)*"/g;

function inside(outer: CetzStatement, st: CetzStatement) {
	return outer !== st && outer.from <= st.from && st.to <= outer.to;
}

/** the statement's text without the statements inside it */
function ownText(source: string, picture: CetzPicture, st: CetzStatement) {
	let at = st.from;
	let out = '';
	for (const inner of picture.statements)
		if (inside(st, inner) && inner.from >= at) {
			out += source.slice(at, inner.from);
			at = inner.to;
		}
	return out + source.slice(at, st.to);
}

function setBy(source: string, st: CetzStatement): StatementNeed[] {
	const text = source.slice(st.from, st.to);
	const name = nameArg(st);
	const named = name && NAME_ARG.exec(source.slice(name.value.from, name.value.to));
	const lets = LET.exec(text);
	return [
		...(named ? [{ kind: 'name' as const, name: named[1] }] : []),
		...(/^import\s+(?:cetz\.)?draw\s*:\s*\*/.test(text) ? [IMPORT] : []),
		...(lets ? (lets[1] ?? lets[2]).split(',').map((n): StatementNeed => ({ kind: 'variable', name: n.trim() })) : [])
	].filter((n) => n.name);
}

function usesNeed(source: string, st: CetzStatement, text: string, need: StatementNeed) {
	if (need.kind === 'import') return DRAW.has(st.command) && !/^(?:cetz\.)?draw\./.test(text);
	const n = need.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	if (need.kind === 'name') {
		const own = nameArg(st);
		const unnamed = own ? text.slice(0, own.from - st.from) + text.slice(own.to - st.from) : text;
		return new RegExp(`"${n}(?:\\.[^"]*)?"`).test(unnamed);
	}
	return new RegExp(`(?<![\\w.-])${n}(?![\\w-])`).test(text.replace(STRING, '""').replace(/^let\s+[^=]*=/, ''));
}

function same(a: StatementNeed, b: StatementNeed) {
	return a.kind === b.kind && a.name === b.name;
}

function readUses(source: string, pictureIndex: number) {
	const picture = readPicture(source, pictureIndex);
	const sets = picture ? picture.statements.flatMap((st) => setBy(source, st).map((need) => ({ st, need }))) : [];
	return { source, picture, sets };
}

/** every use of what `known` names, with whether the picture still gives it: in CeTZ each holds from where it is set
 *  to the end of the group it is set in */
function uses({ source, picture, sets }: ReturnType<typeof readUses>, known: StatementNeed[]) {
	if (!picture) return [];
	const scopes = picture.statements.filter((s) => s.kind === 'scope');
	return picture.statements.flatMap((use) => {
		const text = ownText(source, picture, use);
		const key = text.replace(/\s+/g, ' ').trim();
		function holds(st: CetzStatement) {
			const group = scopes.filter((s) => inside(s, st)).at(-1);
			return inside(st, use) || !group || inside(group, use);
		}
		return known
			.filter((need) => usesNeed(source, use, text, need) && !sets.some((s) => s.st === use && same(s.need, need)))
			.map((need) => {
				const by = sets.filter((s) => same(s.need, need)).map((s) => s.st);
				const before = by.filter((st) => st.to <= use.from || inside(st, use));
				const why: BrokenNeed['why'] | null = before.some(holds) ? null : before.length ? 'group' : by.length ? 'first' : 'gone';
				return { key: `${key}|${need.kind}:${need.name}`, use, need, why };
			});
	});
}

export function brokenNeedText({ need, why }: BrokenNeed, title: string) {
	const what = { name: m.figure_need_element({ name: need.name }), import: m.figure_need_draw(), variable: need.name }[need.kind];
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
