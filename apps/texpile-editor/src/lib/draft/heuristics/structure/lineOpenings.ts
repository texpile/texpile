import type { SyntaxNode, Tree } from '@lezer/common';
import { commonCommand } from '$lib/languages/latex/knowledge/calls/commandCalls';
import { environmentName } from '$lib/languages/latex/syntax/treeMode';

/** what a line starts with where paragraphs are split: the top level, the inside of prose environments and of unclosed constructs */
export type LineOpening =
	| { kind: 'comment' }
	| { kind: 'command'; name: string; end: number }
	| { kind: 'end'; name: string }
	| { kind: 'begin'; name: string; lastLine: number; open: boolean };

const END_NAME = /^\\end\s*\{|\}$/g;
const CONTAINERS = new Set(['Group', 'InlineMath', 'DisplayMath', 'BracketMath', 'ParenMath', 'OwnMath']);
const UNCLOSED = new Set(['GroupEnd', 'MathEnd', 'EnvEnd']);

// an unclosed construct swallows the rest of the buffer while it is typed, so the lines inside it keep their meaning
function isUnclosed(node: SyntaxNode): boolean {
	return UNCLOSED.has(node.lastChild?.name ?? '');
}

// a group no command can take as its argument is a scope inside the text: the lines in it keep their meaning
function isScope(group: SyntaxNode, src: string): boolean {
	for (let before = group.prevSibling; before; before = before.prevSibling) {
		const text = before.name === 'Text' ? src.slice(before.from, before.to).trim() : '';
		if (before.name === 'Text' && !text) continue;
		if (before.name === 'ControlWord') return commonCommand(src.slice(before.from + 1, before.to))?.args.length === 0;
		return before.name !== 'Group' && before.name !== 'CloseBracket' && !text.endsWith('*');
	}
	return true;
}

// the \end an unclosed group swallowed, where the environment really ends
function swallowedEnd(tree: Tree, src: string, env: SyntaxNode, name: string): SyntaxNode | null {
	let found: SyntaxNode | null = null;
	tree.iterate({
		from: env.from,
		to: env.to,
		enter(node) {
			if (found) return false;
			if (node.name === 'StrayEnd' && src.slice(node.from, node.to).replace(END_NAME, '') === name) found = node.node;
		}
	});
	return found;
}

/** one entry per line; a line starting with plain text, a group or math, or inside any other construct, has none */
export function lineOpenings(src: string, tree: Tree, starts: number[], proseEnvs: ReadonlySet<string>): (LineOpening | undefined)[] {
	const found: (LineOpening | undefined)[] = new Array(starts.length);
	function lineAt(offset: number): number {
		let lo = 0;
		let hi = starts.length - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (starts[mid] <= offset) lo = mid;
			else hi = mid - 1;
		}
		return lo;
	}
	function startsLine(offset: number): number {
		const line = lineAt(offset);
		return /^[ \t\r]*$/.test(src.slice(starts[line], offset)) ? line : -1;
	}
	function lastLineOf(from: number, to: number): number {
		let end = to;
		while (end > from && (src[end - 1] === ' ' || src[end - 1] === '\t')) end--;
		return lineAt(Math.max(end - 1, from));
	}
	// whether the children of each open node sit where paragraphs are split
	const levels: boolean[] = [];
	tree.iterate({
		enter(node) {
			const inside = levels.at(-1) ?? true;
			const name = node.name;
			let children = false;
			if (name === 'Document') children = true;
			else if (name === 'Environment') {
				const begin = node.node.firstChild;
				children = inside && !!begin && (proseEnvs.has(environmentName(src, begin)) || isUnclosed(node.node));
			} else if (CONTAINERS.has(name)) children = inside && (isUnclosed(node.node) || (name === 'Group' && isScope(node.node, src)));
			else if (name === 'Skipped') {
				const first = startsLine(node.from);
				for (let line = first >= 0 ? first : lineAt(node.from) + 1; line <= lineAt(node.to); line++) found[line] = { kind: 'comment' };
			} else if (name === 'Comment') {
				const line = startsLine(node.from);
				if (line >= 0) found[line] = { kind: 'comment' };
			} else if (name === 'ControlWord' || name === 'BeginEnv' || name === 'VerbatimBegin' || name === 'EndEnv' || name === 'StrayEnd') {
				const tokenOfEnvironment = name !== 'ControlWord' && name !== 'StrayEnd';
				const line = (tokenOfEnvironment ? levels.at(-2) : inside) ? startsLine(node.from) : -1;
				if (line >= 0 && !found[line]) {
					if (name === 'ControlWord') found[line] = { kind: 'command', name: src.slice(node.from + 1, node.to), end: node.to };
					else if (name === 'EndEnv' || name === 'StrayEnd')
						found[line] = { kind: 'end', name: src.slice(node.from, node.to).replace(END_NAME, '') };
					else {
						const env = node.node.parent!;
						const envName = environmentName(src, node.node);
						const open = env.lastChild?.name !== 'EndEnv';
						const swallowed = open ? swallowedEnd(tree, src, env, envName) : null;
						found[line] = {
							kind: 'begin',
							name: envName,
							lastLine: swallowed ? lineAt(swallowed.to - 1) : lastLineOf(env.from, env.to),
							open: open && !swallowed
						};
					}
				}
			}
			levels.push(children);
		},
		leave() {
			levels.pop();
		}
	});
	return found;
}
