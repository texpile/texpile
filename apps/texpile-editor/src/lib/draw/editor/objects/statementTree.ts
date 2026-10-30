import type { FigureStatement } from '../figure/figureLanguage';

/** the picture's statements as nested in scopes: each one's parent (0 at the top) and children, in written order */
export type StatementTree = {
	parent: Map<number, number>;
	children: Map<number, number[]>;
	byId: Map<number, FigureStatement>;
};

export function buildTree(statements: FigureStatement[]): StatementTree {
	const parent = new Map<number, number>();
	const children = new Map<number, number[]>([[0, []]]);
	const open: FigureStatement[] = [];
	for (const st of [...statements].sort((a, b) => a.from - b.from || b.to - a.to)) {
		while (open.length && open.at(-1)!.to < st.to) open.pop();
		const p = open.at(-1)?.i ?? 0;
		parent.set(st.i, p);
		children.get(p)!.push(st.i);
		children.set(st.i, []);
		if (st.kind === 'scope' || st.kind === 'axis' || st.kind === 'branch') open.push(st);
	}
	return { parent, children, byId: new Map(statements.map((s) => [s.i, s])) };
}

/** the statement and everything inside it */
export function subtree(tree: StatementTree, i: number): number[] {
	return [i, ...(tree.children.get(i) ?? []).flatMap((c) => subtree(tree, c))];
}

/** from the statement out to its outermost scope */
export function ancestry(tree: StatementTree, i: number): number[] {
	const out = [i];
	for (let p = tree.parent.get(i) ?? 0; p; p = tree.parent.get(p) ?? 0) out.push(p);
	return out;
}

/**
 * What a click on a drawn statement selects: the level the selection is already at, the way a design tool steps into
 * groups, else its outermost scope
 */
export function clickTarget(tree: StatementTree, hit: number, selection: number[]) {
	const chain = ancestry(tree, hit);
	const level = chain.find((c) => selection.some((s) => s === c || tree.parent.get(s) === tree.parent.get(c)));
	return level ?? chain.at(-1)!;
}

/** one level further in toward the drawn statement, from a selected scope it is inside */
export function stepIn(tree: StatementTree, hit: number, selected: number) {
	const chain = ancestry(tree, hit);
	const k = chain.indexOf(selected);
	return k > 0 ? chain[k - 1] : null;
}

/** where a statement is after an edit: the one with its text nearest where it was carried to, else the one starting there */
export function followStatement(after: FigureStatement[], source: string, text: string, at: number | null) {
	if (at === null) return null;
	const same = after.filter((s) => source.slice(s.from, s.to) === text).sort((a, b) => Math.abs(a.from - at) - Math.abs(b.from - at));
	return same[0] ?? after.find((s) => s.from === at) ?? null;
}
