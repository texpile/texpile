import type { SyntaxNode, Tree } from '@lezer/common';
import { environmentName, holds } from './treeMode';

export type InnermostEnvironment = { node: SyntaxNode; name: string };

const ENVIRONMENTS = new Set(['Environment', 'VerbatimEnvironment']);

/** the innermost environment whose body `pos` is in; one unclosed or closing after `pos` counts */
export function innermostEnvironmentAt(tree: Tree, text: string, pos: number): InnermostEnvironment | null {
	for (let node: SyntaxNode | null = tree.resolveInner(pos, -1); node; node = node.parent) {
		const begin = node.firstChild;
		if (ENVIRONMENTS.has(node.name) && begin && holds(node, pos)) return { node, name: environmentName(text, begin) };
	}
	return null;
}
