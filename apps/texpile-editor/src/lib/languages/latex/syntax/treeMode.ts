import type { SyntaxNode, Tree } from '@lezer/common';
import { argumentHolding, commonCommand, rolesOf, type CallArgument, type IndexReading } from '../knowledge/calls/commandCalls';
import { commonEnvFacts, holdsMath, type EnvFacts } from '../knowledge/environments/envFacts';
import type { Role } from '../knowledge/types';
import { NO_OWN_MATH, type OwnMath } from './ownMath';

export type TreeMode = 'math' | 'text' | null;

export type ModeReadings = {
	envFacts: (name: string) => EnvFacts;
	commandReading: (name: string) => IndexReading | null;
	own: OwnMath;
};

export const COMMON_READINGS: ModeReadings = { envFacts: commonEnvFacts, commandReading: commonCommand, own: NO_OWN_MATH };

const MATH = new Set(['InlineMath', 'DisplayMath', 'BracketMath', 'ParenMath', 'OwnMath']);
const DEFINITION_ROLES: Role[] = ['body', 'begin', 'end'];
const SIBLINGS_BACK = 12;
const PRIMITIVE_DEFINITION = /^\\(?:[gex]?def|let)\s*\\(?:[A-Za-z@]+|.)[^{}\n]*$/;

const CLOSERS = new Set(['Dollar', 'DoubleDollar', 'CloseDisplay', 'CloseInline', 'EndEnv', 'OwnMathClose', '}']);

export function literalAt(tree: Tree, pos: number): 'Comment' | 'Verb' | 'VerbatimBody' | null {
	const node = tree.resolveInner(pos, -1);
	if (node.from >= pos) return null;
	if (node.name === 'Comment' || node.name === 'VerbatimBody') return node.name;
	return node.name === 'Verb' && pos < node.to ? 'Verb' : null;
}

export function holds(node: SyntaxNode, pos: number): boolean {
	const open = node.firstChild;
	if (pos < (open ? open.to : node.from + 1) || pos > node.to) return false;
	const last = node.lastChild;
	const closed = last && last !== open && CLOSERS.has(last.name) && !last.type.isError;
	return !closed || pos <= last.from;
}

export function environmentName(text: string, begin: SyntaxNode): string {
	return text.slice(begin.from, begin.to).replace(/^\\begin\s*\{|\}$/g, '');
}

function argumentOf(group: SyntaxNode, text: string, pos: number, readings: ModeReadings): { command: string; arg: CallArgument } | null {
	let sibling = group.prevSibling;
	for (let i = 0; sibling && i < SIBLINGS_BACK; i++, sibling = sibling.prevSibling) {
		if (sibling.name !== 'ControlWord') continue;
		const command = text.slice(sibling.from + 1, sibling.to);
		const reading = readings.commandReading(command);
		const arg = reading && argumentHolding(text.slice(sibling.from, pos), sibling.to - sibling.from, reading);
		if (arg) return { command, arg };
	}
	return null;
}

function primitiveDefinitionBody(group: SyntaxNode, text: string): boolean {
	let sibling = group.prevSibling;
	for (let i = 0; sibling && i < 4; i++, sibling = sibling.prevSibling)
		if (sibling.name === 'ControlWord' && PRIMITIVE_DEFINITION.test(text.slice(sibling.from, group.from))) return true;
	return false;
}

export function modeFromTree(tree: Tree, text: string, pos: number, bodyStart = 0, readings = COMMON_READINGS): TreeMode {
	if (pos < bodyStart || literalAt(tree, pos)) return null;
	for (let node: SyntaxNode | null = tree.resolveInner(pos, -1); node; node = node.parent) {
		if (node.name !== 'Document' && !holds(node, pos)) continue;
		if (MATH.has(node.name)) return 'math';
		if (node.name === 'Group') {
			if (primitiveDefinitionBody(node, text)) return null;
			const found = argumentOf(node, text, pos, readings);
			if (found && (readings.own.wrappers.has(found.command) || rolesOf(found.arg.arg).some((r) => DEFINITION_ROLES.includes(r))))
				return null;
			if (found?.arg.arg.mode) return found.arg.arg.mode;
		}
		if (node.name === 'Environment' && node.firstChild) {
			const name = environmentName(text, node.firstChild);
			if (holdsMath(readings.envFacts(name)) || readings.own.environments.has(name)) return 'math';
		}
	}
	return 'text';
}
