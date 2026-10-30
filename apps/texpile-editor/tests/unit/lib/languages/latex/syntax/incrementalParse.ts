import { IterMode, TreeFragment, type Tree } from '@lezer/common';
import type { LRParser } from '@lezer/lr';

export type TextEdit = { from: number; to: number; insert: string };

export function applyEdit(text: string, edit: TextEdit): string {
	return text.slice(0, edit.from) + edit.insert + text.slice(edit.to);
}

function treesOf(tree: Tree): Set<Tree> {
	const found = new Set<Tree>();
	const cursor = tree.cursor(IterMode.IncludeAnonymous);
	do {
		const inner = cursor.tree;
		if (inner) found.add(inner);
	} while (cursor.next());
	return found;
}

function nodesOf(tree: Tree): string[] {
	const nodes: string[] = [];
	tree.iterate({ enter: (n) => void nodes.push(`${n.name}@${n.from}-${n.to}`) });
	return nodes;
}

/** the first node where two trees differ, or null when they are the same */
export function firstDifference(a: Tree, b: Tree): string | null {
	const left = nodesOf(a);
	const right = nodesOf(b);
	const at = left.findIndex((node, i) => node !== right[i]);
	if (at < 0) return left.length === right.length ? null : `length ${left.length} against ${right.length}`;
	return `${left[at]} against ${right[at]} (node ${at})`;
}

/** parses `text` after `edit` on the fragments of its earlier tree, and says how many nodes of that tree the parse reused */
export function reparse(parser: LRParser, text: string, edit: TextEdit): { tree: Tree; fresh: Tree; reused: number } {
	const before = parser.parse(text);
	const after = applyEdit(text, edit);
	const change = { fromA: edit.from, toA: edit.to, fromB: edit.from, toB: edit.from + edit.insert.length };
	const tree = parser.parse(after, TreeFragment.applyChanges(TreeFragment.addTree(before), [change]));
	const old = treesOf(before);
	return { tree, fresh: parser.parse(after), reused: [...treesOf(tree)].filter((t) => old.has(t)).length };
}
