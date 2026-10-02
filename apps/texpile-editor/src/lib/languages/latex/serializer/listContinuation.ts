// which list nodes are written as one environment, and under which name
import type { Node } from 'prosemirror-model';
import type { Ctx } from '$lib/serializer/types';

function envKeyOf(node: Node): string | null {
	return typeof node.attrs.envKey === 'string' && node.attrs.envKey ? node.attrs.envKey : null;
}

/** one key is the other's or one around it */
function nests(a: string, b: string): boolean {
	return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

/** whether the run around `parent`'s children `index - 1` and `index` holds an item of either source list on the other's side */
function interleaved(parent: Node, index: number, before: string, after: string): boolean {
	for (let i = index + 1; i < parent.childCount && parent.child(i).type.name === 'list'; i++)
		if (envKeyOf(parent.child(i)) === before) return true;
	for (let i = index - 2; i >= 0 && parent.child(i).type.name === 'list'; i--) if (envKeyOf(parent.child(i)) === after) return true;
	return false;
}

/**
 * Two lists the source wrote as separate environments stay separate, edited or not: the verbatim layer emits a
 * pristine neighbour with its own \begin and \end, so coalescing a regenerated one into it left an unbalanced
 * environment. Editor-made list nodes carry no source environment and still coalesce, and so do items a Tab or
 * Shift+Tab brought together (one environment held the other) or a drag put among another list's items
 */
function sameSourceList(parent: Node, index: number): boolean {
	const before = envKeyOf(parent.child(index - 1));
	const after = envKeyOf(parent.child(index));
	if (!before || !after || nests(before, after)) return true;
	return interleaved(parent, index, before, after);
}

/** whether `parent`'s child at `index` is written as more of the list environment before it, with no \begin of its own */
export function continuesList(parent: Node, index: number): boolean {
	const node = parent.child(index);
	const prev = index > 0 ? parent.child(index - 1) : null;
	if (node.type.name !== 'list' || prev?.type.name !== 'list' || prev.attrs.kind !== node.attrs.kind || !sameSourceList(parent, index))
		return false;
	const own = ownEnvName(node);
	const prevEnv = runEnvName(prev, { parent, index: index - 1 }) ?? (node.attrs.kind === 'ordered' ? 'enumerate' : 'itemize');
	return own === null || own === prevEnv;
}

/** the environment name a list node carries itself, if any; an item made numbered is no longer a description's */
function ownEnvName(node: Node): string | null {
	return node.attrs.kind === 'bullet' && typeof node.attrs.envName === 'string' && node.attrs.envName ? node.attrs.envName : null;
}

/** the environment name the first node of this run of list nodes carries, if any */
export function runEnvName(node: Node, ctx: Pick<Ctx, 'parent' | 'index'>): string | null {
	if (!ctx.parent) return ownEnvName(node);
	const kind = node.attrs.kind;
	for (let i = ctx.index; i >= 0; i--) {
		const n = ctx.parent.child(i);
		if (n.type.name !== 'list' || n.attrs.kind !== kind || (i < ctx.index && !sameSourceList(ctx.parent, i + 1))) break;
		const name = ownEnvName(n);
		if (name) return name;
	}
	return null;
}

/**
 * Whether `node` opening a run writes the options and setup of the environment it came from: not when it was made
 * another kind, nor when Tab moved it into an item of its own list, where it starts a list of its own
 */
export function opensItsSourceList(node: Node, parent: Node | null): boolean {
	const key = envKeyOf(node);
	if (!key) return true;
	if (!key.slice(key.lastIndexOf('/') + 1).startsWith(`${node.attrs.kind}.`)) return false;
	const around = parent?.type.name === 'list' ? envKeyOf(parent) : null;
	return !around || !(around === key || around.startsWith(`${key}/`));
}
