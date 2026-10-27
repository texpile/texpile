import type { Tree } from '@lezer/common';
import { parser } from './parser';

const KEPT = 4;
const trees = new Map<string, Tree>();

function keep(text: string, tree: Tree): Tree {
	trees.delete(text);
	trees.set(text, tree);
	if (trees.size > KEPT) trees.delete(trees.keys().next().value!);
	return tree;
}

export function latexTreeOf(text: string): Tree {
	const found = trees.get(text);
	return found ? keep(text, found) : keep(text, parser.parse(text));
}

/** an editor's finished parse, so readers of the same text skip parsing it again */
export function rememberLatexTree(text: string, tree: Tree): void {
	if (tree.length === text.length) keep(text, tree);
}
