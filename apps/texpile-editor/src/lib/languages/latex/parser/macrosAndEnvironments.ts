// unified-latex's macro-and-environment stage, with the math re-parse keeping the file's offsets.
//
// Upstream (unifiedLatexProcessMacrosAndEnvironmentsWithMathReparse) prints the content of a math
// macro's argument or a math environment back to a string and parses that string afresh in math
// mode, so every node inside carries an offset counted from the content's own start, not the
// file's: `\frac{\act_i}{b}` reports its subscript at offset 0, and any span computed over it is
// short or nonsense. Here the content's own bytes are parsed instead and every position moved to
// where they sit in the file; content that cannot be found in the file is parsed as upstream does
// and left without positions, since no position is better than a wrong one. Every other step is
// upstream's, in upstream's order.
import type { Transformer } from 'unified';
import type * as Ast from '@unified-latex/unified-latex-types';
import { visit } from '@unified-latex/unified-latex-util-visit';
import { match } from '@unified-latex/unified-latex-util-match';
import { printRaw } from '@unified-latex/unified-latex-util-print-raw';
import { attachMacroArgsInArray, gobbleArguments } from '@unified-latex/unified-latex-util-arguments';
import { parseMathMinimal } from '@unified-latex/unified-latex-util-parse';
import { commandNames } from '../knowledge/calls/commandCalls';

/* eslint-disable no-param-reassign -- a unified plugin transforms the tree in place, as upstream's does */

type Position = NonNullable<Ast.Node['position']>;
type Positioned = { position?: Position; content?: unknown; args?: unknown[] };

export type MacrosAndEnvironmentsOptions = {
	macros: Record<string, Ast.MacroInfo>;
	environments: Record<string, Ast.EnvInfo>;
	/** commands that take their arguments in math only: an argument the parser reads as text (\begin{numcases}{\dot m_x})
	 * would give \dot the word m_ */
	mathCommands?: Record<string, Ast.MacroInfo>;
};

/** the bytes `nodes` cover, from the positions they and their descendants carry */
function extent(nodes: unknown[]): { from: number; to: number } | null {
	let from = Infinity;
	let to = -Infinity;
	function walk(n: unknown): void {
		if (!n || typeof n !== 'object') return;
		const p = (n as Positioned).position;
		if (p) {
			if (typeof p.start?.offset === 'number') from = Math.min(from, p.start.offset);
			if (typeof p.end?.offset === 'number') to = Math.max(to, p.end.offset);
		}
		for (const kids of [(n as Positioned).content, (n as Positioned).args]) if (Array.isArray(kids)) kids.forEach(walk);
	}
	nodes.forEach(walk);
	return Number.isFinite(from) && Number.isFinite(to) && from < to ? { from, to } : null;
}

/** every position under `nodes` moved by `by`; with `by` null, dropped */
function moved(nodes: unknown[], by: number | null): void {
	function walk(n: unknown): void {
		if (!n || typeof n !== 'object') return;
		const node = n as Positioned;
		if (node.position) {
			if (by === null) delete node.position;
			else {
				node.position = {
					start: { ...node.position.start, offset: node.position.start.offset + by },
					end: { ...node.position.end, offset: node.position.end.offset + by }
				};
			}
		}
		for (const kids of [node.content, node.args]) if (Array.isArray(kids)) kids.forEach(walk);
	}
	nodes.forEach(walk);
}

/**
 * Upstream's heuristic for content already read in math mode: a string longer than one character,
 * or a `^` or `_` left as a string rather than a macro, says it was not.
 */
function wasParsedInMathMode(nodes: Ast.Node[]): boolean {
	return !nodes.some((node) => (match.anyString(node) && node.content.length > 1) || match.string(node, '^') || match.string(node, '_'));
}

/** `nodes` read again in math mode: from their own bytes in `source` when they can be found there */
function reparsedAsMath(nodes: Ast.Node[], source: string | undefined): Ast.Node[] {
	const span = source !== undefined ? extent(nodes) : null;
	if (span && span.to <= source!.length) {
		const fresh = parseMathMinimal(source!.slice(span.from, span.to)) as Ast.Node[];
		moved(fresh, span.from);
		return fresh;
	}
	const fresh = parseMathMinimal(printRaw(nodes)) as Ast.Node[];
	moved(fresh, null);
	return fresh;
}

/** upstream's processEnvironment: arguments attached, render info merged, the body processed */
function processEnvironment(env: Ast.Environment, envInfo: Ast.EnvInfo): void {
	if (envInfo.signature && env.args == null) env.args = gobbleArguments(env.content, envInfo.signature).args;
	if (envInfo.renderInfo != null) env._renderInfo = { ...(env._renderInfo || {}), ...envInfo.renderInfo };
	if (typeof envInfo.processContent !== 'function') return;
	// upstream's list cleanup throws on an empty `args` before a blank line (\smallskip ahead of the first \item)
	const bare = env.content.filter((node): node is Ast.Macro => match.anyMacro(node) && node.args?.length === 0);
	for (const macro of bare) delete macro.args;
	env.content = envInfo.processContent(env.content);
	for (const macro of bare) macro.args ??= [];
}

// in text (an equation behind a \def'd wrapper) a math command takes a braced argument or a single letter: a bare word
// would be taken whole (\dot mx as \dot{mx})
function bracedInText(commands: Record<string, Ast.MacroInfo>): Record<string, Ast.MacroInfo> {
	const out: Record<string, Ast.MacroInfo> = {};
	for (const [name, entry] of Object.entries(commands)) {
		const kinds = entry.signature?.split(' ') ?? [];
		if (!kinds.length || kinds.some((k) => k !== 'm')) continue;
		out[name] = {
			...entry,
			argumentParser: (nodes, startPos) => {
				let at = startPos;
				for (let k = 0; k < kinds.length; k++, at++) {
					while (match.whitespace(nodes[at])) at++;
					const node = nodes[at];
					const letter = node?.type === 'string' && node.content.length === 1;
					if (!match.group(node) && !letter) return { args: undefined as unknown as Ast.Argument[], nodesRemoved: 0 };
				}
				return gobbleArguments(nodes, entry.signature!, startPos);
			}
		};
	}
	return out;
}

// TeX's own definers; the package data holds the LaTeX ones
const PRIMITIVE_DEFINERS = [
	'def',
	'edef',
	'gdef',
	'xdef',
	'let',
	'futurelet',
	'chardef',
	'mathchardef',
	'countdef',
	'dimendef',
	'skipdef',
	'toksdef'
];
const DEFINERS = new Set([...commandNames(['macro']), ...PRIMITIVE_DEFINERS]);

// the command a definer names takes no arguments of its own (\providecommand*\natexlab[1]{#1}, natbib's \natexlab{x})
function holdDefinedNames(nodes: Ast.Node[]): void {
	for (let i = 0; i < nodes.length; i++) {
		if (!match.anyMacro(nodes[i]) || !DEFINERS.has((nodes[i] as Ast.Macro).content)) continue;
		let at = i + 1;
		while (match.whitespace(nodes[at]) || (nodes[at]?.type === 'string' && (nodes[at] as Ast.String).content === '*')) at++;
		const named = nodes[at];
		if (match.anyMacro(named) && named.args == null) named.args = [];
	}
}

function mathOnly<T extends { renderInfo?: { inMathMode?: boolean } }>(table: Record<string, T>): Record<string, T> {
	return Object.fromEntries(Object.entries(table).filter(([, entry]) => entry.renderInfo?.inMathMode === true));
}

export function processMacrosAndEnvironments(options: MacrosAndEnvironmentsOptions): Transformer<Ast.Root, Ast.Root> {
	const { environments, macros, mathCommands = {} } = options;
	const textMacros = { ...bracedInText(mathCommands), ...macros };
	const mathMacros = mathOnly(macros);
	const mathEnvs = mathOnly(environments);
	const isMathEnvironment = match.createEnvironmentMatcher(Object.keys(mathEnvs));
	const isMathMacro = match.createMacroMatcher(Object.keys(mathMacros));
	const isRelevantEnvironment = match.createEnvironmentMatcher(environments);
	const isRelevantMathEnvironment = match.createEnvironmentMatcher(mathEnvs);
	function processEnv(node: Ast.Environment): void {
		const name = printRaw(node.env);
		const envInfo = environments[name];
		if (!envInfo) throw new Error(`Could not find environment info for environment "${name}"`);
		processEnvironment(node, envInfo);
	}
	return (tree, file) => {
		const source = typeof file.value === 'string' ? file.value : undefined;
		visit(
			tree,
			(nodes) => {
				if (Array.isArray(nodes)) holdDefinedNames(nodes);
			},
			{ includeArrays: true }
		);
		visit(
			tree,
			{
				enter: (nodes) => {
					if (Array.isArray(nodes)) attachMacroArgsInArray(nodes, mathMacros);
				},
				leave: (node) => {
					if (isRelevantMathEnvironment(node)) processEnv(node);
				}
			},
			{ includeArrays: true }
		);
		visit(
			tree,
			(node) => {
				if (match.anyMacro(node)) {
					for (const arg of node.args || [])
						if (arg.content.length > 0 && !wasParsedInMathMode(arg.content)) arg.content = reparsedAsMath(arg.content, source);
				}
				if (match.anyEnvironment(node) && !wasParsedInMathMode(node.content)) node.content = reparsedAsMath(node.content, source);
			},
			{ test: (node) => isMathEnvironment(node) || isMathMacro(node) }
		);
		// before ^ and _ attach, so they take \dot{x} whole
		visit(
			tree,
			{
				enter: (nodes, visited) => {
					if (Array.isArray(nodes) && visited.context.inMathMode) attachMacroArgsInArray(nodes, mathCommands);
				}
			},
			{ includeArrays: true }
		);
		visit(
			tree,
			{
				enter: (nodes) => {
					if (Array.isArray(nodes)) attachMacroArgsInArray(nodes, textMacros);
				},
				leave: (node) => {
					if (isRelevantEnvironment(node)) processEnv(node);
				}
			},
			{ includeArrays: true }
		);
	};
}
