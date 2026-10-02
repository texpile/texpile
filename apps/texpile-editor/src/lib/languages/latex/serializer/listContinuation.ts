// which list nodes are written as one environment, and under which name
import type { Node } from 'prosemirror-model';
import type { Ctx } from '$lib/serializer/types';
import { blockOriginOf } from '$lib/editor/visual/parseOrigins';

/**
 * Two lists the source wrote as separate environments stay separate: the verbatim layer emits a
 * pristine neighbour with its own \begin and \end, so coalescing a regenerated one into it left
 * an unbalanced environment. Editor-made list nodes carry no source group and still coalesce, and
 * so do items a Tab or Shift+Tab brought together: the file ended no environment between them.
 */
function sameSourceList(a: Node, b: Node): boolean {
	const oa = blockOriginOf(a);
	const ob = blockOriginOf(b);
	if (!oa || !ob || (oa.parse === ob.parse && oa.index - oa.member === ob.index - ob.member)) return true;
	return !(oa.member === oa.size - 1 && ob.member === 0);
}

/** whether `parent`'s child at `index` is written as more of the list environment before it, with no \begin of its own */
export function continuesList(parent: Node, index: number): boolean {
	const node = parent.child(index);
	const prev = index > 0 ? parent.child(index - 1) : null;
	if (node.type.name !== 'list' || prev?.type.name !== 'list' || prev.attrs.kind !== node.attrs.kind || !sameSourceList(prev, node))
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
		if (n.type.name !== 'list' || n.attrs.kind !== kind || (i < ctx.index && !sameSourceList(n, ctx.parent.child(i + 1)))) break;
		const name = ownEnvName(n);
		if (name) return name;
	}
	return null;
}

/** the first item of the source environment a top-level run of items is, whose options the run opens with once that item is gone */
export function sourceListHead(parent: Node, index: number): Node | null {
	if (parent.type.name !== 'doc') return null;
	const kind = parent.child(index).attrs.kind;
	for (let i = index; i < parent.childCount && (i === index || continuesList(parent, i)); i++) {
		const o = blockOriginOf(parent.child(i));
		if (!o) continue;
		const head = o.parse.origins[o.index - o.member]?.node;
		return head?.type.name === 'list' && head.attrs.kind === kind ? head : null;
	}
	return null;
}
