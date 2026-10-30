import type { DrawnPart } from '$lib/draw/editor/drawing/drawing.types';
import { plainStatement } from '../plainStatement';
import type { Picture, Statement } from '../picture';
import { branches, readForest, type Branch, type ForestTree } from './forestTree';

// forest typesets its nodes ahead and draws them later, so each node is marked as it is drawn, by the number its
// own `tikzcap` option holds; its edge is drawn apart, so the node's box is the node's alone
export const EDGE_MARK = 100000;
// the picture's end is marked as forest closes the tikzpicture, where a node's own `tikz=` cannot take it away
export const TREE_MARK = String.raw`\makeatletter\forestset{declare count={tikzcap}{0},
end draw/.prefix code={\tikzcapmark{0}},
draw tree node/.code={\tikzcapmark{\forestove{tikzcap}}\forest@draw@node},
draw tree edge/.code={\tikzcapmark{\the\numexpr\forestove{tikzcap}+${EDGE_MARK}\relax}\forest@draw@edge}}\makeatother`;
export const NEW_TREE =
	'\\begin{forest}\n  for tree={draw, rounded corners, align=center}\n  [Root\n    [Child [Leaf] [Leaf]]\n    [Child]\n  ]\n\\end{forest}\n';

/** a forest tree: each branch a statement, the root first, each before its children */
export function readTreePicture(source: string, from: number, to: number): Picture & { forest: ForestTree } {
	const forest = readForest(source, from, to);
	const statements: Statement[] = branches(forest).map((b, k) => ({ ...plainStatement(b.from, b.to, 'branch', '', false), i: k + 1 }));
	return { from, to, env: 'forest', layout: 'tree', bodyFrom: forest.bodyFrom, endFrom: forest.endFrom, statements, forest };
}

/** an edge shows, hides and moves with its node */
export function withEdgesOwned(parts: DrawnPart[]) {
	return parts.map((p) => (p.stmt >= EDGE_MARK ? { ...p, stmt: p.stmt - EDGE_MARK, apart: true } : p));
}

export function treeCuts(picture: Picture & { forest: ForestTree }, kept: Statement[]) {
	const { forest } = picture;
	const byFrom = new Map(branches(forest).map((b): [number, Branch] => [b.from, b]));
	return kept.flatMap((s) => {
		const b = byFrom.get(s.from);
		return b ? [{ at: b.content.to, text: `, tikzcap=${s.i}` }] : [];
	});
}
