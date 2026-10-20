// best-effort guesses about custom commands the converter has no first-class knowledge of, kept
// separate from the deterministic config in macros.ts. each takes an isKnown(name) predicate from
// the converter so this module needn't import the handler table.
import type { Root, Node } from '@unified-latex/unified-latex-types';
import { type RawStamped } from './ast-utils';
import { environmentFacts } from './signatures/environmentFacts';
import { holdsMath } from '../knowledge/environments/envFacts';
import { commonCommand, rolesOf } from '../knowledge/calls/commandCalls';
import type { PackageTable } from './signatures/packageTable';
import type { DefinedMacro } from './signatures/definedMacros';
import { ignoredMacros, isScopedSwitch, RAW_WHOLESALE_ARG_MACROS } from './macros';
import { endsInComment } from './urlMask';

// the exact structural shape read/written by this file's polymorphic sibling walks; keeps real
// property types without narrowing by discriminant first.
type LooseNode = RawStamped<{
	type: string;
	content?: unknown;
	args?: { content: Node[] }[];
	position?: { start?: { offset?: number }; end?: { offset?: number } };
	sameline?: boolean;
	env?: string;
}>;

/**
 * Preserve a frontmatter-style call whose {...} argument groups are interleaved with sameline
 * comments (\setstudentinfo {a} % name ...) VERBATIM: stripSamelineComments would delete the
 * comments and the call would re-serialize collapsed onto one line. the exact span (from AST
 * source positions) is stashed on the macro as `_raw`; consumed siblings are spliced out so
 * they aren't emitted twice. fires ONLY when a comment is actually interleaved among an
 * UNKNOWN macro's groups; plain calls keep the normal signature/attachment path.
 */
export function heuristicMarkCommentedMacroCalls(nodes: Node[] | undefined, source: string, isKnown: (name: string) => boolean): void {
	if (!Array.isArray(nodes) || !source) return;
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i] as LooseNode;
		// recurse into content and args, but NOT a RAW_WHOLESALE_ARG_MACROS macro's args: that
		// node is rebuilt by ONE printRaw call, so `_raw` set inside just deletes content from its
		// view. everything else's args genuinely get re-walked downstream (table cells, \caption),
		// so info set there IS honoured. see RAW_WHOLESALE_ARG_MACROS's comment.
		if (Array.isArray(node.content)) heuristicMarkCommentedMacroCalls(node.content as Node[], source, isKnown);
		const skipArgs = node.type === 'macro' && RAW_WHOLESALE_ARG_MACROS.has(node.content as string);
		if (!skipArgs && node.args) for (const a of node.args) heuristicMarkCommentedMacroCalls(a.content, source, isKnown);

		if (node.type !== 'macro' || (node.args && node.args.length) || !node.position) continue;
		const name = node.content as string;
		// regex is a lexical control-word test on an AST-isolated name (letters + @), never raw source.
		if (isKnown(name) || ignoredMacros.has(name) || isScopedSwitch(name) || !/^[a-zA-Z@]+$/.test(name)) continue;

		// walk the trailing run of whitespace / sameline-comments / groups (the call's arguments),
		// stopping at anything else (a parbreak, the next macro, prose).
		let j = i + 1;
		let groups = 0;
		let sawComment = false;
		let lastEnd = node.position.end?.offset ?? -1;
		for (; j < nodes.length; j++) {
			const nx = nodes[j] as LooseNode;
			if (nx.type === 'whitespace') continue;
			if (nx.type === 'comment' && nx.sameline) {
				sawComment = true;
				if (nx.position?.end?.offset != null) lastEnd = nx.position.end.offset;
				continue;
			}
			if (nx.type === 'group') {
				groups++;
				if (nx.position?.end?.offset != null) lastEnd = nx.position.end.offset;
				continue;
			}
			break;
		}
		const start = node.position.start?.offset ?? -1;
		if (groups >= 1 && sawComment && start >= 0 && lastEnd > start) {
			const text = source.slice(start, lastEnd);
			// if the span ends inside a % comment, bake in a newline: a dangling comment marker
			// would eat whatever the serializer puts next on that line and compound every save.
			// (lexical tail check: comments don't nest or span lines.) At the end of the file
			// there is no line end to take, and the span must stay the file's bytes
			node._raw = lastEnd < source.length && endsInComment(text) ? text + '\n' : text;
			// its arguments are in the span: a later attach would hand it the next call, cell break or word as one.
			// an optional argument after it ([q]{-}{-}) is still its own
			const next = nodes[j] as LooseNode | undefined;
			if (!(next?.type === 'string' && next.content === '[')) node.args ??= [];
			nodes.splice(i + 1, j - (i + 1)); // drop the consumed run; the span lives on `_raw` now
		}
	}
}

export const DEF_LIKE_PRIMITIVES = new Set(['def', 'edef', 'gdef', 'xdef']);
const LET_LIKE_PRIMITIVES = new Set(['let', 'futurelet']);

/**
 * \def/\edef/\gdef/\xdef and \let/\futurelet are TeX primitives whose true syntax a signature
 * cannot express (\def's parameter text is arbitrary undelimited tokens, \let's target/source are
 * bare csnames). unregistered, the definition's parts become independent SIBLING nodes: the
 * primitive is dropped (ignoredMacros) while # gets escaped and the body's braces get stripped,
 * turning a working definition into something pdflatex can't compile. so capture the WHOLE
 * construct's exact source span verbatim and splice out the consumed siblings.
 */
export function heuristicMarkTexPrimitiveDefs(nodes: Node[] | undefined, source: string, pairsOut?: Map<string, string>): void {
	// \def\be{\begin{equation}} and \def\ee{\end{equation}}: the span between \be and \ee is math,
	// and only the pair of definitions says so. collected across the walk, paired at the end
	const envDefs: EnvDefs = { open: new Map(), close: new Map() };
	markTexPrimitiveDefs(nodes, source, pairsOut, envDefs);
	if (pairsOut) pairEnvDefs(envDefs, pairsOut);
}

/** a definition body that is exactly \begin{X} or \end{X}, and nothing else: [begin|end, X] */
function envBodyOf(body: string): ['begin' | 'end', string] | null {
	const m = /^\s*\\(begin|end)\s*\{([a-zA-Z*]+)\}\s*$/.exec(body);
	return m ? [m[1] as 'begin' | 'end', m[2]] : null;
}

/** the body group of a zero-parameter \def as the source writes it, without its braces */
function groupText(group: LooseNode, source: string): string {
	const from = group.position?.start?.offset;
	const to = group.position?.end?.offset;
	return typeof from === 'number' && typeof to === 'number' ? source.slice(from + 1, to - 1) : '';
}

type EnvDefs = { open: Map<string, string>; close: Map<string, string> };

/** an opener is only a delimiter pair once its matching closer has been seen too */
function pairEnvDefs(envDefs: EnvDefs, pairsOut: Map<string, string>): void {
	for (const [env, opener] of envDefs.open) {
		const closer = envDefs.close.get(env);
		if (closer && !pairsOut.has(opener)) pairsOut.set(opener, closer);
	}
}

/**
 * The same env-shortcut pair, defined the other common way:
 * `\newcommand{\bea}{\begin{eqnarray}}` with `\newcommand{\eea}{\end{eqnarray}}`. Only
 * zero-argument definitions qualify, because a pair with parameters is not a plain delimiter.
 * Without this the span between \bea and \eea reads as prose and its math is text-escaped.
 */
export function envPairsFromDefinitions(list: readonly DefinedMacro[], pairsOut: Map<string, string>): void {
	const envDefs: EnvDefs = { open: new Map(), close: new Map() };
	for (const cmd of list) {
		if (cmd.signature.trim() || cmd.body === undefined) continue;
		const env = envBodyOf(cmd.body);
		if (env) envDefs[env[0] === 'begin' ? 'open' : 'close'].set(env[1], cmd.name);
	}
	pairEnvDefs(envDefs, pairsOut);
}

function markTexPrimitiveDefs(
	nodes: Node[] | undefined,
	source: string,
	pairsOut: Map<string, string> | undefined,
	envDefs: EnvDefs
): void {
	if (!Array.isArray(nodes) || !source) return;
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i] as LooseNode;
		// recurse into CONTENT only, never macro args: an unknown macro's args are rebuilt by the
		// generic printRaw printer, which never reads `_raw`; splicing "consumed" siblings there
		// deletes content that was already round-tripping fine (a nested \edef collapsed to bare).
		if (Array.isArray(node.content)) markTexPrimitiveDefs(node.content as Node[], source, pairsOut, envDefs);

		if (node.type !== 'macro' || (node.args && node.args.length) || !node.position) continue;
		const name = node.content as string;
		const start: number | undefined = node.position.start?.offset;
		if (typeof start !== 'number') continue;

		if (DEF_LIKE_PRIMITIVES.has(name)) {
			// consume siblings up to and including the FIRST group (the body); bail at a parbreak
			// (a real \def never spans a blank line) rather than over-consume on an odd shape.
			let j = i + 1;
			let lastEnd = node.position.end?.offset ?? start;
			let sawGroup = false;
			for (; j < nodes.length; j++) {
				const nx = nodes[j] as LooseNode;
				if (nx.type === 'parbreak') break;
				if (nx.position?.end?.offset != null) lastEnd = nx.position.end.offset;
				if (nx.type === 'group') {
					sawGroup = true;
					j++;
					break;
				}
			}
			if (sawGroup) {
				// delimited-parameter shape \def\NAME #1...\DELIM {body}: record the pair for
				// heuristicMarkDelimitedMacroSpans. derived from AST tokens, NOT a source scan,
				// so a definition merely quoted inside verbatim/comment can never register.
				if (pairsOut) {
					const consumed = nodes.slice(i + 1, j) as LooseNode[]; // [..., DELIM?, body group]
					if (consumed.length === 2 && consumed[0].type === 'macro' && /^[a-zA-Z@]+$/.test(String(consumed[0].content ?? ''))) {
						const env = envBodyOf(groupText(consumed[1], source));
						if (env) envDefs[env[0] === 'begin' ? 'open' : 'close'].set(env[1], String(consumed[0].content));
					}
					if (consumed.length >= 3) {
						const nameNode = consumed[0];
						const delimNode = consumed[consumed.length - 2];
						// lexical control-word test on AST-isolated names
						function isCs(n: LooseNode | undefined) {
							return n?.type === 'macro' && /^[a-zA-Z@]+$/.test(String(n.content ?? ''));
						}
						// everything between NAME and DELIM must be pure #N parameter text; any
						// other token is a shape we don't understand, so record nothing. non-string
						// nodes map to a NUL sentinel so they fail the check instead of slipping by.
						const paramText = consumed
							.slice(1, consumed.length - 2)
							.map((m) => (m.type === 'string' ? String(m.content ?? '') : m.type === 'whitespace' ? ' ' : '\u0000'))
							.join('');
						if (isCs(nameNode) && isCs(delimNode) && /^(\s*#\d+)+\s*$/.test(paramText)) {
							pairsOut.set(String(nameNode.content), String(delimNode.content));
						}
					}
				}
				node._raw = source.slice(start, lastEnd);
				nodes.splice(i + 1, j - (i + 1));
			}
		} else if (LET_LIKE_PRIMITIVES.has(name)) {
			// \let<target><=?><source>: up to two csname "units", no whitespace assumed between
			// them (\let\@fnsymbol\@arabic has none). a unit is one macro node plus any string
			// node(s) glued onto it: \@fnsymbol tokenizes as the control symbol \@ plus a separate
			// "fnsymbol" string, so a fresh unit starts at every 'macro' node; a naive two-token
			// count would leave the second csname dangling unconsumed.
			let j = i + 1;
			let lastEnd = node.position.end?.offset ?? start;
			let units = 0;
			while (j < nodes.length && units < 2) {
				const nx = nodes[j] as LooseNode;
				if (nx.type === 'string' && /^=+$/.test(String(nx.content ?? ''))) {
					if (nx.position?.end?.offset != null) lastEnd = nx.position.end.offset;
					j++;
					continue; // the optional `=` doesn't start or count as a unit
				}
				if (nx.type !== 'macro') break; // whitespace, group, parbreak: not a unit start
				if (nx.position?.end?.offset != null) lastEnd = nx.position.end.offset;
				j++;
				units++;
				while (j < nodes.length && (nodes[j] as LooseNode).type === 'string') {
					const strNode = nodes[j] as LooseNode;
					if (strNode.position?.end?.offset != null) lastEnd = strNode.position.end.offset;
					j++;
				}
			}
			if (units >= 1) {
				node._raw = source.slice(start, lastEnd);
				nodes.splice(i + 1, j - (i + 1));
			}
		}
	}
}

/**
 * Preserve a whole `\NAME ... \DELIM` call verbatim when \NAME was \def-ined with a delimited
 * parameter. the span is the macro's ARGUMENT, very often math, but the parser sees \NAME as an
 * unknown zero-arg macro and text-escapes the span as prose (& to \&, _ to \_), destroying it.
 * must run AFTER heuristicMarkTexPrimitiveDefs (which consumes the definitions' own tokens, so
 * only real call sites remain visible). the scan stops at a parbreak: a delimited macro's
 * argument can't contain a blank line, so an unmatched \NAME can never swallow unrelated content.
 */
export function heuristicMarkDelimitedMacroSpans(nodes: Node[] | undefined, source: string, pairs: Map<string, string>): void {
	if (!Array.isArray(nodes) || !source || pairs.size === 0) return;
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i] as LooseNode;
		// a group is reprinted by printRaw, which does not read `_raw`: marking a span in there
		// would splice the siblings out and print the remainder, losing the maths between them
		if (Array.isArray(node.content) && node.type !== 'group') heuristicMarkDelimitedMacroSpans(node.content as Node[], source, pairs);
		// args too, minus the wholesale-printRaw macros, exactly as heuristicMarkCommentedMacroCalls
		// does: a list item's body IS an argument of \item, and the \bea ... \eea spans inside it
		// were left to the prose path, which text-escapes their maths
		const skipArgs = node.type === 'macro' && RAW_WHOLESALE_ARG_MACROS.has(node.content as string);
		if (!skipArgs && node.args) for (const a of node.args) heuristicMarkDelimitedMacroSpans(a.content, source, pairs);

		if (node.type !== 'macro' || (node.args && node.args.length) || node._raw != null || !node.position) continue;
		const delim = pairs.get(node.content as string);
		if (!delim) continue;
		const start: number | undefined = node.position.start?.offset;
		if (typeof start !== 'number') continue;

		let j = i + 1;
		let end = -1;
		for (; j < nodes.length; j++) {
			const nx = nodes[j] as LooseNode;
			if (nx.type === 'parbreak') break;
			if (nx.type === 'macro' && nx.content === delim && !(nx.args && nx.args.length)) {
				end = nx.position?.end?.offset ?? -1;
				j++;
				break;
			}
		}
		if (end > start) {
			node._raw = source.slice(start, end);
			nodes.splice(i + 1, j - (i + 1));
		}
	}
}

const NAME_ROLES = ['file', 'graphic', 'bibfile'];

/** which braced argument of the call holds the file name, counting from 0; -1 for a command that takes none */
function nameArgumentOf(command: string): number {
	const args = commonCommand(command)?.args ?? [];
	const at = args.findIndex((a) => rolesOf(a).some((r) => NAME_ROLES.includes(r)));
	return at < 0 ? -1 : args.slice(0, at).filter((a) => a.kind.replace(/^!/, '') === 'm').length;
}

/**
 * `\input section6.tex` with no braces: TeX reads the file name up to the next space, but the
 * parser hands the macro one token (`section6`) and leaves `.tex` behind as prose. The strings
 * glued to a bare argument are folded back into it, so the chip names the whole file
 */
export function heuristicGlueBareFileArgs(nodes: Node[] | undefined, source: string): void {
	if (!nodes) return;
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i] as LooseNode;
		if (Array.isArray(node.content) && node.type !== 'group') heuristicGlueBareFileArgs(node.content as Node[], source);
		if (node.type !== 'macro' || !node.args?.length) continue;
		const nth = nameArgumentOf(node.content as string);
		if (nth < 0) continue;
		const arg = node.args.filter((a) => (a as { openMark?: string }).openMark === '{')[nth];
		const first = arg?.content[0] as LooseNode | undefined;
		const start = first?.position?.start?.offset;
		if (!arg || typeof start !== 'number' || source[start - 1] === '{') continue;
		let end = (arg.content[arg.content.length - 1] as LooseNode).position?.end?.offset ?? -1;
		let j = i + 1;
		for (; j < nodes.length; j++) {
			const nx = nodes[j] as LooseNode;
			if (nx.type !== 'string' || nx.position?.start?.offset !== end) break;
			end = nx.position?.end?.offset ?? -1;
			arg.content.push(nx as Node);
		}
		nodes.splice(i + 1, j - (i + 1));
	}
}

/**
 * Infer an unknown command's arity from usage: a no-arg macro immediately followed by {...}
 * groups almost certainly takes them as arguments; recording `m` x count lets attachMacroArgs
 * re-attach them so they keep their braces. stops at a blank line so an unrelated group isn't
 * swallowed; ignores commands we already understand. returns the inferred signatures for the
 * caller to merge into its macro table.
 */
// an optional argument is a short bracket group on one line. Without a bound, a stray `[` in
// prose pairs with a `]` pages away and the inferred signature swallows everything between.
const MAX_OPT_ARG_NODES = 24;

/** index of the `]` closing the `[` at `from`, or -1 when nothing plausibly does */
function closingBracket(nodes: LooseNode[], from: number): number {
	const limit = Math.min(nodes.length, from + 1 + MAX_OPT_ARG_NODES);
	for (let k = from + 1; k < limit; k++) {
		const n = nodes[k];
		if (n.type === 'parbreak') return -1; // no optional argument spans a blank line
		if (n.type === 'string' && n.content === ']') return k;
	}
	return -1;
}

export function heuristicInferUnknownMacroSignatures(
	ast: Root,
	isKnown: (name: string) => boolean,
	macroInfo: Readonly<Record<string, { signature: string }>>,
	table?: PackageTable
): Record<string, { signature: string }> {
	const MAX_ARGS = 9;
	// the fullest call site wins: `\todo[inline]{x}` after a bare `\todo{x}` gives `o m`
	const counts: Record<string, { n: number; signature: string }> = {};

	// never infer inside math: math serializes verbatim, and many math macros (\over, \hat) are
	// followed by a {...} that is NOT their argument; attaching it restructures math and compounds.
	function isMath(node: LooseNode): boolean {
		return (
			node.type === 'mathenv' ||
			node.type === 'displaymath' ||
			node.type === 'inlinemath' ||
			(node.type === 'environment' && holdsMath(environmentFacts({ table }, node.env ?? '')))
		);
	}

	function walk(nodes: Node[] | undefined): void {
		if (!Array.isArray(nodes)) return;
		for (let i = 0; i < nodes.length; i++) {
			const node = nodes[i] as LooseNode;
			if (isMath(node)) continue;
			if (node.type === 'macro') {
				const name = node.content as string;
				const hasArgs = node.args && node.args.length > 0;
				const known = isKnown(name) || ignoredMacros.has(name) || isScopedSwitch(name) || !!macroInfo[name];
				// letter/@ names only; skip control symbols like \\ and \,
				if (!hasArgs && !known && /^[a-zA-Z@]+$/.test(name)) {
					const sig: string[] = [];
					for (let j = i + 1; j < nodes.length && sig.length < MAX_ARGS; j++) {
						const nx = nodes[j] as LooseNode;
						if (nx.type === 'whitespace' || nx.type === 'comment') continue;
						if (nx.type === 'group') {
							sig.push('m');
							continue;
						}
						// `[...]` tokenizes as loose strings; an opening bracket glued to the call
						// (`\todo[inline]{}`, `\SI[per-mode=symbol]{}{}`) is an optional argument.
						// A space before it is prose that happens to start with a bracket.
						if (nx.type === 'string' && nx.content === '[' && nodes[j - 1]?.type !== 'whitespace') {
							const close = closingBracket(nodes as LooseNode[], j);
							if (close < 0) break;
							sig.push('o');
							j = close;
							continue;
						}
						break; // text / parbreak / macro / environment ends the argument run
					}
					if (sig.length > 0 && sig.length > (counts[name]?.n ?? 0)) counts[name] = { n: sig.length, signature: sig.join(' ') };
				}
			}
			if (Array.isArray(node.content)) walk(node.content as Node[]);
			// recursing into args is load-bearing for most macros (table cell content IS re-walked
			// downstream, so an inferred \makecell signature is honoured), but NOT for a
			// RAW_WHOLESALE_ARG_MACROS macro: its one-shot printRaw rebuild silently drops an
			// inferred+attached signature instead of reproducing it.
			const skipArgs = node.type === 'macro' && RAW_WHOLESALE_ARG_MACROS.has(node.content as string);
			if (!skipArgs && node.args) for (const a of node.args) walk(a.content);
		}
	}
	walk(ast.content as Node[]);

	const inferred: Record<string, { signature: string }> = {};
	for (const [name, { signature }] of Object.entries(counts)) {
		if (!macroInfo[name]) inferred[name] = { signature };
	}
	return inferred;
}
