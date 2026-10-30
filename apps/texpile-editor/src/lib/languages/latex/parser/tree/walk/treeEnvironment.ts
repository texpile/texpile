import type { SyntaxNode } from '@lezer/common';
import type { Argument } from '../../../knowledge/types';
import { PieceCursor } from './pieceCursor';
import { bodyOf, environmentName, type Stretch } from './stretch';
import { readCall, type TreeArg } from './treeArgs';

/** an environment with the arguments its \begin reads; `body` is what follows them */
export type TreeEnvironment = { node: SyntaxNode; name: string; from: number; to: number; beginTo: number; args: TreeArg[]; body: Stretch };

export function readEnvironment(src: string, node: SyntaxNode, signature: readonly Argument[]): TreeEnvironment {
	const begin = node.firstChild!;
	const inner = bodyOf(node);
	const cursor = new PieceCursor(src, inner);
	const call = readCall(cursor, { node: begin, from: begin.from, to: begin.to, kind: 'node' }, 'begin', signature);
	return {
		node,
		name: environmentName(src, begin),
		from: node.from,
		to: node.to,
		beginTo: begin.to,
		args: call.args,
		body: { parent: node, from: cursor.pos, to: inner.to }
	};
}

export function argumentsText(src: string, env: TreeEnvironment): string {
	const present = env.args.filter((a) => a.present);
	return present.length ? src.slice(present[0].from, present[present.length - 1].to) : '';
}
