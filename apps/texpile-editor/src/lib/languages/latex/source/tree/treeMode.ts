import type { SyntaxNode, Tree } from '@lezer/common';
import { callAt, rolesOf } from '../../knowledge/calls/commandCalls';
import { commonEnvFacts, holdsMath } from '../../knowledge/environments/envFacts';
import type { Role } from '../../knowledge/types';
import { ownMath } from './ownMath';

export type TreeMode = 'math' | 'text' | null;

const MATH = new Set(['InlineMath', 'DisplayMath', 'BracketMath', 'ParenMath', 'OwnMath']);
const LITERAL = new Set(['Comment', 'Verb', 'VerbatimBody']);
const DEFINITION_ROLES: Role[] = ['body', 'begin', 'end'];
const SIBLINGS_BACK = 12;

const CLOSERS = new Set(['Dollar', 'DoubleDollar', 'CloseDisplay', 'CloseInline', 'EndEnv', 'OwnMathClose', '}']);

function holds(node: SyntaxNode, pos: number): boolean {
	const open = node.firstChild;
	if (pos < (open ? open.to : node.from + 1) || pos > node.to) return false;
	const last = node.lastChild;
	const closed = last && last !== open && CLOSERS.has(last.name) && !last.type.isError;
	return !closed || pos <= last.from;
}

export function environmentName(text: string, begin: SyntaxNode): string {
	return text.slice(begin.from, begin.to).replace(/^\\begin\s*\{|\}$/g, '');
}

function argumentOf(group: SyntaxNode, text: string, pos: number) {
	let sibling = group.prevSibling;
	for (let i = 0; sibling && i < SIBLINGS_BACK; i++, sibling = sibling.prevSibling) {
		if (sibling.name !== 'ControlWord') continue;
		const arg = callAt(text, sibling.from)?.args.find((a) => a.from <= pos && pos <= a.to);
		if (arg) return arg;
	}
	return null;
}

export function modeFromTree(tree: Tree, text: string, pos: number, bodyStart = 0): TreeMode {
	if (pos < bodyStart) return null;
	for (let node: SyntaxNode | null = tree.resolveInner(pos, -1); node; node = node.parent) {
		if (LITERAL.has(node.name)) return null;
		if (node.name !== 'Document' && !holds(node, pos)) continue;
		if (MATH.has(node.name)) return 'math';
		if (node.name === 'Group') {
			const arg = argumentOf(node, text, pos);
			if (arg && rolesOf(arg.arg).some((r) => DEFINITION_ROLES.includes(r))) return null;
			if (arg?.arg.mode) return arg.arg.mode;
		}
		if (node.name === 'Environment' && node.firstChild) {
			const name = environmentName(text, node.firstChild);
			if (holdsMath(commonEnvFacts(name)) || ownMath().environments.has(name)) return 'math';
		}
	}
	return 'text';
}
