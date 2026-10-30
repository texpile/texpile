// the arguments the import reads for each command
import type { SyntaxNode, Tree } from '@lezer/common';
import type { Argument } from '../../../knowledge/types';
import { ACCENT_COMMANDS, SYMBOLS } from '../../../knowledge/commands/texCharacters';
import { commonFacts } from '../../../knowledge/commands/commandFacts';
import { codeOnly } from '../../../texCode';
import { definedIn, primitiveDefsIn } from '../../../userDefinitions';
import { holdsMath } from '../../../knowledge/environments/envFacts';
import { ignoredMacros, isScopedSwitch } from '../../macros';
import { definedMacrosIn, type DefinedMacro } from '../../signatures/definedMacros';
import { signatureOfArgs } from '../../signatures/argSignature';
import { tableEnvFacts } from '../../signatures/environmentFacts';
import type { PackageTable } from '../../signatures/packageTable';
import { environmentName } from './stretch';

export type ImportReadings = {
	table: PackageTable;
	/** the arguments a call of `name` reads; null for a command whose arguments nothing states */
	argumentsOf(name: string): readonly Argument[] | null;
	environmentArgumentsOf(name: string): readonly Argument[];
	/** the loaded files or a redefinition say how the command reads, in text or in math */
	tableKnows(name: string): boolean;
};

// the row break's star and [space] follow it directly
const CODE: Record<string, Argument[]> = { '\\': [{ kind: '!s' }, { kind: '!o' }] };

function argsOfSignature(signature: string): Argument[] {
	return signature
		.split(' ')
		.filter(Boolean)
		.map((kind) => ({ kind }));
}

const tableRecords = new WeakMap<PackageTable, Map<string, Argument[]>>();

/** the table's readable signatures, the math-only commands' too (TeX reads \mathbb Z in text as in math) */
function tableArguments(table: PackageTable): Map<string, Argument[]> {
	let found = tableRecords.get(table);
	if (!found) {
		found = new Map();
		for (const [name, args] of Object.entries(table.macros))
			if (signatureOfArgs(args) !== null && !ACCENT_COMMANDS.has(name) && !(name in SYMBOLS) && !ignoredMacros.has(name))
				found.set(name, args);
		tableRecords.set(table, found);
	}
	return found;
}

/** a redefinition without parameters keeps the table's arguments, and \providecommand leaves a known command as it is */
function replaces(table: Map<string, Argument[]>, d: DefinedMacro): boolean {
	const own = table.get(d.name);
	if (!own) return false;
	const keeps = d.defines === 'provide' || (!d.signature && (d.defines === 'renew' || d.defines === 'replace'));
	return !keeps && own.map((a) => a.kind).join(' ') !== d.signature;
}

/** a command the data says prints a glyph, with no arguments stated (\textdegree) */
function printsGlyph(name: string): boolean {
	return commonFacts(name).prints !== undefined && !ACCENT_COMMANDS.has(name);
}

// an optional argument is a short bracket group on one line
const MAX_BRACKET_SIBLINGS = 24;
const MAX_INFERRED = 9;
const MATH_NODES = new Set(['InlineMath', 'DisplayMath', 'BracketMath', 'ParenMath', 'OwnMath']);

function isBlankText(src: string, node: SyntaxNode): boolean {
	return node.name === 'Text' && src.slice(node.from, node.to).trim() === '';
}

/** the arguments the fullest call of each unknown command writes: groups, and a bracket group glued to it */
function inferredArguments(tree: Tree, src: string, isKnown: (name: string) => boolean, table: PackageTable): Map<string, Argument[]> {
	const counts = new Map<string, Argument[]>();
	tree.iterate({
		enter(node) {
			if (MATH_NODES.has(node.name)) return false;
			if (node.name === 'Environment') {
				const begin = node.node.firstChild;
				if (begin && holdsMath(tableEnvFacts(table, environmentName(src, begin)))) return false;
			}
			if (node.name !== 'ControlWord') return;
			const name = src.slice(node.from + 1, node.to);
			if (isKnown(name)) return;
			const sig: Argument[] = [];
			for (let next = node.node.nextSibling; next && sig.length < MAX_INFERRED; next = next.nextSibling) {
				if (isBlankText(src, next) || next.name === 'Comment') continue;
				// guessed from groups, so a call without one takes none
				if (next.name === 'Group') {
					sig.push({ kind: 'g' });
					continue;
				}
				const before = next.prevSibling;
				if (next.name === 'OpenBracket' && before && !isBlankText(src, before)) {
					let close: SyntaxNode | null = null;
					let k = 0;
					for (let n = next.nextSibling; n && k < MAX_BRACKET_SIBLINGS; n = n.nextSibling, k++) {
						if (n.name === 'ParBreak') break;
						if (n.name === 'CloseBracket') {
							close = n;
							break;
						}
					}
					if (!close) break;
					sig.push({ kind: 'o' });
					next = close;
					continue;
				}
				break;
			}
			if (sig.length > (counts.get(name)?.length ?? 0)) counts.set(name, sig);
		}
	});
	return counts;
}

/** `known`: the commands the converter reads itself, whose calls say nothing of an unknown command */
export function importReadingsOf(options: {
	table: PackageTable;
	body: string;
	preamble: string;
	tree: Tree;
	known: (name: string) => boolean;
}): ImportReadings {
	const table = tableArguments(options.table);
	const bodyMacros = definedMacrosIn(options.body);
	const preambleMacros = options.preamble ? definedMacrosIn(options.preamble) : [];
	const replaced = new Map<string, Argument[]>();
	for (const d of [...preambleMacros, ...bodyMacros])
		if (replaces(table, d) && !replaced.has(d.name)) replaced.set(d.name, argsOfSignature(d.signature));
	const own = new Map<string, Argument[]>();
	for (const d of [...bodyMacros, ...preambleMacros]) if (!own.has(d.name)) own.set(d.name, argsOfSignature(d.signature));
	// \def\name#1#2{...} takes two
	for (const d of primitiveDefsIn(codeOnly(`${options.preamble}\n${options.body}`)))
		if (d.params !== null && !own.has(d.name))
			own.set(
				d.name,
				Array.from({ length: d.params }, () => ({ kind: 'm' }))
			);
	function stated(name: string): readonly Argument[] | null {
		return CODE[name] ?? replaced.get(name) ?? table.get(name) ?? own.get(name) ?? (printsGlyph(name) ? [] : null);
	}
	const inferred = inferredArguments(
		options.tree,
		options.body,
		(name) => !/^[a-zA-Z@]+$/.test(name) || stated(name) !== null || options.known(name) || ignoredMacros.has(name) || isScopedSwitch(name),
		options.table
	);
	// \newtheorem{definition} makes an environment taking [name]
	const environments = new Map<string, Argument[]>();
	for (const d of definedIn(codeOnly(`${options.preamble}\n${options.body}`), 'environment'))
		if (!environments.has(d.name)) environments.set(d.name, d.args);
	return {
		table: options.table,
		argumentsOf: (name) => stated(name) ?? inferred.get(name) ?? null,
		environmentArgumentsOf: (name) => options.table.envs[name] ?? environments.get(name) ?? [],
		tableKnows: (name) => name in CODE || replaced.has(name) || table.has(name)
	};
}
