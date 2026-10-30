import type { SyntaxNode, Tree } from '@lezer/common';
import { latexTreeOf } from './latexTrees';

/** the commands a text writes, as its syntax tree reads them: none in a comment, verbatim text or skipped text */
export type CommandTokens = {
	/** command name (no backslash) by the offset of its backslash */
	byOffset: Map<number, string>;
	list: { name: string; at: number; end: number }[];
	/** `\begin{name}` in order, `end` just past its closing brace */
	begins: { name: string; at: number; end: number }[];
	/** where the `{` at each offset closes, -1 when it opens no group the tree reads */
	closes: Int32Array;
};

const KEPT = 4;
const kept = new Map<string, { tree: Tree; tokens: CommandTokens }>();

const BEGIN_NAME = /^\\begin\s*\{\s*([^}]*?)\s*\}$/;

export function commandTokensOf(text: string): CommandTokens {
	const tree = latexTreeOf(text);
	const found = kept.get(text);
	if (found?.tree === tree) return found.tokens;
	const tokens: CommandTokens = { byOffset: new Map(), list: [], begins: [], closes: new Int32Array(text.length).fill(-1) };
	// \begin and \end are commands with arguments too (\begin{lstlisting}[label=a])
	function commandOf(at: number, name: string) {
		tokens.byOffset.set(at, name);
		tokens.list.push({ name, at, end: at + 1 + name.length });
	}
	tree.iterate({
		enter(node) {
			if (node.name === 'ControlWord') {
				commandOf(node.from, text.slice(node.from + 1, node.to));
			} else if (node.name === 'BeginEnv' || node.name === 'VerbatimBegin') {
				const name = BEGIN_NAME.exec(text.slice(node.from, node.to))?.[1];
				if (name !== undefined) tokens.begins.push({ name, at: node.from, end: node.to });
				commandOf(node.from, 'begin');
			} else if (node.name === 'EndEnv' || node.name === 'StrayEnd') {
				commandOf(node.from, 'end');
			} else if (node.name === 'Group') {
				const close = node.node.lastChild;
				if (close?.name === '}') tokens.closes[node.from] = close.from;
			} else if (node.name === 'UrlArgument') tokens.closes[node.from] = node.to - 1;
		}
	});
	kept.delete(text);
	kept.set(text, { tree, tokens });
	if (kept.size > KEPT) kept.delete(kept.keys().next().value!);
	return tokens;
}

export const BRACED = new Set(['Group', 'UrlArgument']);
export const BRACED_OR_OPTIONAL = new Set([...BRACED, 'OpenBracket']);

/** the command is followed by a node of `openers`, only blanks and comments between; a glued star is a blank when `starred` */
export function opensArgument(
	read: (from: number, to: number) => string,
	command: SyntaxNode,
	starred: boolean,
	openers: ReadonlySet<string>
): boolean {
	let next = command.nextSibling;
	for (let first = true; next?.name === 'Text' || next?.name === 'Comment'; first = false, next = next.nextSibling) {
		if (next.name === 'Comment') continue;
		const text = read(next.from, next.to);
		if ((first && starred && next.from === command.to ? text.replace(/^\*/, '') : text).trim()) return false;
	}
	return next !== null && openers.has(next.name);
}
