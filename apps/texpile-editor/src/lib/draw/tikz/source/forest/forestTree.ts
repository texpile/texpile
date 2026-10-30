import type { TextSpan } from '$lib/draw/editor/figure/figureLanguage';
/** a bracket `[content, options [child] ...]`: `from` at its `[`, `to` past its `]` */
export type Branch = TextSpan & { content: TextSpan; options: TextSpan | null; children: Branch[]; parent: Branch | null };
export type ForestTree = {
	/** the keys before the tree, `for tree={...}` */
	preamble: TextSpan;
	root: Branch | null;
	bodyFrom: number;
	endFrom: number;
};

const BEGIN = '\\begin{forest}';

/** past a group opened at `at` by `{`, a comment, or one escaped character */
function skip(source: string, at: number) {
	if (source[at] === '\\') return at + 2;
	if (source[at] === '%') {
		const eol = source.indexOf('\n', at);
		return eol < 0 ? source.length : eol + 1;
	}
	if (source[at] !== '{') return at + 1;
	let depth = 0;
	for (let k = at; k < source.length; k++) {
		if (source[k] === '\\') k++;
		else if (source[k] === '{') depth++;
		else if (source[k] === '}' && --depth === 0) return k + 1;
	}
	return source.length;
}

function trimmed(source: string, from: number, to: number): TextSpan {
	const text = source.slice(from, to);
	const lead = text.length - text.trimStart().length;
	return { from: from + lead, to: from + lead + text.trim().length };
}

/** the bracket at `at` and everything in it, or null when it never closes */
function readBranch(source: string, at: number, end: number, parent: Branch | null): Branch | null {
	const branch: Branch = { from: at, to: at, content: { from: at + 1, to: at + 1 }, options: null, children: [], parent };
	let k = at + 1;
	function stop(chars: string) {
		while (k < end && !chars.includes(source[k])) k = skip(source, k);
	}
	stop(',[]');
	branch.content = trimmed(source, at + 1, k);
	if (source[k] === ',') {
		const from = k + 1;
		stop('[]');
		branch.options = trimmed(source, from, k);
	}
	while (source[k] === '[') {
		const child = readBranch(source, k, end, branch);
		if (!child) return null;
		branch.children.push(child);
		k = child.to;
		while (k < end && /\s/.test(source[k])) k++;
	}
	if (source[k] !== ']') return null;
	branch.to = k + 1;
	return branch;
}

/** a forest environment's tree, at `from` in the source */
export function readForest(source: string, from: number, to: number): ForestTree {
	const bodyFrom = from + BEGIN.length;
	const endFrom = to - '\\end{forest}'.length;
	let k = bodyFrom;
	while (k < endFrom && source[k] !== '[') k = skip(source, k);
	const root = k < endFrom ? readBranch(source, k, endFrom, null) : null;
	return { preamble: trimmed(source, bodyFrom, k), root, bodyFrom, endFrom };
}

/** every branch, the root first, each before its children */
export function branches(tree: ForestTree): Branch[] {
	const out: Branch[] = [];
	function walk(b: Branch) {
		out.push(b);
		b.children.forEach(walk);
	}
	if (tree.root) walk(tree.root);
	return out;
}
