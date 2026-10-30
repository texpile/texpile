import type { SyntaxNode, Tree } from '@lezer/common';
import { literalAt } from './treeMode';

export type TreeKeyList = { command: string; environment?: string; typed: string[]; opener: '[' | '{'; from: number };

const CONTAINERS = new Set([
	'Document',
	'Group',
	'Environment',
	'VerbatimEnvironment',
	'InlineMath',
	'DisplayMath',
	'BracketMath',
	'ParenMath'
]);
const SIBLINGS_BACK = 12;

function containerAt(tree: Tree, pos: number): SyntaxNode {
	for (let node: SyntaxNode | null = tree.resolveInner(pos, -1); node; node = node.parent) {
		if (!CONTAINERS.has(node.name)) continue;
		if (node.name === 'Document' || (node.from < pos && (pos < node.to || node.lastChild?.type.isError || node.lastChild?.name !== '}')))
			return node;
	}
	return tree.topNode;
}

function commandBefore(node: SyntaxNode, text: string): { command: string; environment?: string; typed: string[] } | null {
	const typed: string[] = [];
	let depth = 0;
	let sibling = node.prevSibling;
	for (let i = 0; sibling && i < SIBLINGS_BACK; i++, sibling = sibling.prevSibling) {
		const name = sibling.name;
		if (name === 'ControlWord' && depth === 0) return { command: text.slice(sibling.from + 1, sibling.to), typed: typed.reverse() };
		if ((name === 'BeginEnv' || name === 'VerbatimBegin') && depth === 0)
			return {
				command: 'begin',
				environment: text.slice(sibling.from, sibling.to).replace(/^\\begin\s*\{|\}$/g, ''),
				typed: typed.reverse()
			};
		if (name === 'Group' && depth === 0) typed.push('{}');
		else if (name === 'CloseBracket') depth++;
		else if (name === 'OpenBracket') {
			if (!depth) return null;
			if (--depth === 0) typed.push('[]');
		} else if (name === 'Text' && depth === 0 && !/^[\s+*!/=<>~^|:?-]*$/.test(text.slice(sibling.from, sibling.to))) return null;
		else if (name !== 'Text' && depth === 0) return null;
	}
	return null;
}

export function keyListFromTree(tree: Tree, text: string, pos: number): TreeKeyList | null {
	if (literalAt(tree, pos)) return null;
	const container = containerAt(tree, pos);
	let depth = 0;
	const children: SyntaxNode[] = [];
	for (let child = container.firstChild; child && child.from < pos; child = child.nextSibling) children.push(child);
	for (let i = children.length - 1; i >= 0; i--) {
		const child = children[i];
		if (child.name === 'ParBreak') break;
		if (child.name === 'CloseBracket') depth++;
		else if (child.name === 'OpenBracket') {
			if (depth) depth--;
			else {
				const owner = commandBefore(child, text);
				return owner && { ...owner, opener: '[', from: child.to };
			}
		}
	}
	if (container.name !== 'Group') return null;
	const owner = commandBefore(container, text);
	return owner && { ...owner, opener: '{', from: container.from + 1 };
}
