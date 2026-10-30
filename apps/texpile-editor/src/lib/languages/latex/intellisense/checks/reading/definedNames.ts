// the control sequences a text defines itself, with the spans of the code that defines them
import { definerCallsIn, definitionsIn, derivedDefinitionsIn, environmentDefinitionsIn } from '../../../knowledge/calls/definitions';
import { environmentCallsIn } from '../../../knowledge/calls/commandCalls';
import type { SyntaxNode } from '@lezer/common';
import { codeOnly } from '../../../texCode';
import { latexTreeOf } from '../../../syntax/latexTrees';
import { groupItems, nextItem, wordOf } from '../../../syntax/treeSiblings';
import { environmentName } from '../../../syntax/treeMode';

/** prefixes: names written with a \csname that ends in other tokens; dynamic: a definition names its command by tokens alone */
export type DefinedNames = { names: Set<string>; prefixes: string[]; dynamic: boolean };

// a definer the data does not know still names what it defines first: \DeclareSIUnit\molar{M}, \newcommand*{\x}
const DEFINER =
	/^(?:[gex]?def|let|futurelet|(?:char|mathchar|count|dimen|skip|muskip|toks)def|font|(?:re|provide)?new(?!line|page)[A-Za-z]*|(?:Declare|Provide|Renew|New)[A-Za-z]*|urldef)$/;
const DEFINING_BODY = new RegExp(`\\\\${DEFINER.source.slice(1, -1)}(?![A-Za-z@])`);
const PRIMITIVE_DEFINERS = new Set(['def', 'gdef', 'edef', 'xdef']);
// csvsimple's \csvreader{file}{Label=\Label,5=\Size}{...} names the macros a row fills
const CSV_ROW = new Set(['csvreader', 'csvloop', 'csvuseHeadTab', 'csvprocess']);
const CSV_COLUMN = /=\s*\\([A-Za-z]+)/g;
// tikz's `let \p1 = (0,0), \n2 = {5} in ...` defines \p1 with \x1 and \y1, and \n2
const TIKZ_LET = /(?<![\\A-Za-z@])let\s+(\\[A-Za-z]+(?:\d+|\{[^{}]*\})\s*=[^]{0,600}?)\bin\b/g;
const TIKZ_OPERAND = /\\([A-Za-z]+)(?:\d+|\{[^{}]*\})\s*=/g;
// a name the document tests for before it uses it, by the command that tests it
const TESTS_GROUP = new Set(['@ifundefined', 'ifundefined']);
const TESTS_COMMAND = new Set(['ifdef', 'ifundef', 'ifdefined']);
const UNDEFINED = new Set(['undefined', 'relax']);
const CSNAME_DEFINER = /^(?:[gex]?def|let|(?:re|provide)?newcommand|DeclareRobustCommand|(?:New|Renew|Provide|Declare)DocumentCommand)$/;
const BIBLIOGRAPHY = /^[A-Za-z]*bibliography\*?$/;
// \cs_new:Npn \mine {..} defines a name like \def does
const EXPL_FUNCTION_DEFINER = /^cs_g?(?:new|set)[a-z_]*:N[pn]/;

type Node = SyntaxNode | null;

function isStar(code: string, n: Node): boolean {
	return n?.name === 'Text' && code.slice(n.from, n.to).trim() === '*';
}

function bracketEnd(open: SyntaxNode): Node {
	for (let s = open.nextSibling; s; s = s.nextSibling) if (s.name === 'CloseBracket') return s;
	return null;
}

/** the command a group holds alone, or a bare command: \newcommand{\x} and \newcommand\x */
function namedCommand(code: string, n: Node): string | null {
	if (n?.name !== 'Group') return wordOf(code, n);
	const items = groupItems(code, n);
	return items.length === 1 ? wordOf(code, items[0]) : null;
}

function plainWordOf(code: string, group: Node): string | null {
	if (group?.name !== 'Group') return null;
	const items = groupItems(code, group);
	const word = items.length === 1 && items[0].name === 'Text' ? code.slice(items[0].from, items[0].to).trim() : '';
	return /^[A-Za-z@]+$/.test(word) ? word : null;
}

// the groups after a definer's name: [default] {body} {end}
function argumentsEnd(code: string, name: SyntaxNode): number {
	let end = name.to;
	let s = nextItem(code, name);
	for (let n = 0; n < 4 && s; n++) {
		if (s.name === 'Group') end = s.to;
		else if (s.name === 'OpenBracket') {
			const close = bracketEnd(s);
			if (!close) break;
			s = close;
			end = close.to;
		} else if (n === 0 && isStar(code, s)) end = s.to;
		else break;
		s = nextItem(code, s);
	}
	return end;
}

// \def\bal#1\eal{...}: what follows the name up to the body is parameter text, whose control words are delimiters
function readPrimitiveDef(code: string, def: SyntaxNode, read: ReadDefinitions, bodies: Map<string, string>): void {
	const named = nextItem(code, def);
	if (named?.name !== 'ControlWord' && named?.name !== 'ControlSymbol') return;
	const name = wordOf(code, named);
	if (name) read.names.add(name);
	let s = named.nextSibling;
	for (; s && s.name !== 'Group'; s = s.nextSibling) {
		const delimiter = wordOf(code, s);
		if (delimiter) read.names.add(delimiter);
		else if (s.name !== 'Text' && s.name !== 'ControlSymbol') return;
	}
	if (!s) return;
	read.spans.push([def.from, s.to]);
	if (name) bodies.set(name, code.slice(s.from + 1, s.to));
}

// the options and the file and column groups of a \csvreader call, the body that follows them left out
function csvColumns(code: string, call: SyntaxNode): string {
	let out = '';
	let s = nextItem(code, call);
	if (s?.name === 'OpenBracket') {
		const close = bracketEnd(s);
		if (!close) return out;
		out += code.slice(s.from, close.from);
		s = nextItem(code, close);
	}
	for (let n = 0; n < 2 && s?.name === 'Group'; n++, s = nextItem(code, s)) out += ` ${code.slice(s.from, s.to)}`;
	return out;
}

// a macro defined to define others (\MyPairedDelimiter*{\abs}{\lvert}{\rvert}) names what it defines in its arguments
function wrapperTargets(code: string, call: SyntaxNode, names: Set<string>): void {
	let named = false;
	let s = nextItem(code, call);
	for (let n = 0; n < 4 && s; n++, s = nextItem(code, s)) {
		if (s.name === 'OpenBracket') {
			s = bracketEnd(s);
			if (!s) return;
			continue;
		}
		if (isStar(code, s)) continue;
		if (s.name !== 'Group' && s.name !== 'ControlWord') return;
		const name = namedCommand(code, s) ?? (named ? null : plainWordOf(code, s));
		if (name) names.add(name);
		// \newsiamthm{lemma}{Lemma} names an environment in its first group
		if (s.name === 'Group') named = true;
	}
}

// a macro whose body calls a wrapper (\MyPairedDelimiter ... \My@Paired@Delimiter, which holds the \newcommand) is one too
function wrapperChains(wrappers: Set<string>, bodies: Map<string, string>): void {
	for (let grown = true; grown;) {
		grown = false;
		for (const [name, body] of bodies) {
			if (!wrappers.has(name) && [...wrappers].some((w) => new RegExp(`\\\\${w}(?![A-Za-z@])`).test(body))) {
				wrappers.add(name);
				grown = true;
			}
		}
	}
}

// \ifx\name\undefined, \ifdefined\name, \@ifundefined{name}
function testedName(code: string, word: string, n: SyntaxNode): string | null {
	const next = nextItem(code, n);
	if (TESTS_GROUP.has(word)) return plainWordOf(code, next);
	if (TESTS_COMMAND.has(word)) return namedCommand(code, next);
	if (word !== 'ifx') return null;
	const name = wordOf(code, next);
	return name && next && UNDEFINED.has(wordOf(code, nextItem(code, next)) ?? '') ? name : null;
}

// \foreach \x / \y [count=\i] in {...}: the variables up to `in`
function loopVariables(code: string, loop: SyntaxNode): string[] {
	const names: string[] = [];
	let s = nextItem(code, loop);
	for (; s; s = nextItem(code, s)) {
		const name = wordOf(code, s);
		if (name) names.push(name);
		else if (s.name !== 'Text' || code.slice(s.from, s.to).trim() !== '/') break;
	}
	const close = s?.name === 'OpenBracket' ? bracketEnd(s) : null;
	// count=\n and evaluate=... as \v name a variable too
	for (let o = close && s!.nextSibling; o && o.from < close!.from; o = o.nextSibling) {
		const name = wordOf(code, o);
		const before = o.prevSibling;
		if (name && before?.name === 'Text' && /(?:=|\bas)\s*$/.test(code.slice(before.from, before.to))) names.push(name);
	}
	if (close) s = nextItem(code, close);
	return s?.name === 'Text' && /^\s*in\b/.test(code.slice(s.from, s.to)) ? names : [];
}

// \def\csname name\endcsname: the literal it starts with, '' when it starts with other tokens
function csnameLiteral(code: string, definer: SyntaxNode): string | null {
	let s = nextItem(code, definer);
	if (s?.name === 'Group') s = groupItems(code, s)[0] ?? null;
	if (wordOf(code, s) !== 'csname') return null;
	const next = s!.nextSibling;
	return next?.name === 'Text' ? code.slice(next.from, next.to).trim() : '';
}

/** spans: where each definition's own text stands, the names and bodies a use inside is no use of */
export type ReadDefinitions = DefinedNames & { spans: [number, number][] };

let last: { code: string; read: ReadDefinitions } | null = null;

function readDefinerCalls(code: string, read: ReadDefinitions, wrappers: Set<string>, bodies: Map<string, string>): void {
	const calls = definerCallsIn(code);
	// a call that only names one (\AtBeginEnvironment{itemize}{code}) holds uses like any other text
	for (const c of calls) if (c.args.some((a) => a.arg.defines)) read.spans.push([c.at, c.end]);
	for (const c of environmentCallsIn(code, ['macro', 'environment', 'counter', 'derives'])) read.spans.push([c.at, c.end]);
	for (const d of [...definitionsIn(code, calls), ...environmentDefinitionsIn(code), ...derivedDefinitionsIn(code)]) {
		// \newenvironment{rep#1} inside a wrapper defines every name that starts with rep; a bare #1 is the wrapper's to resolve
		const parameter = d.name.indexOf('#');
		if (parameter > 0) read.prefixes.push(d.name.slice(0, parameter));
		read.names.add(d.name);
		if (d.kind !== 'macro') read.names.add(`the${d.name}`);
		else if (d.body) {
			bodies.set(d.name, d.body);
			if (DEFINING_BODY.test(d.body)) wrappers.add(d.name);
		}
	}
}

/** true when a definition names its command by tokens alone */
function readCommand(code: string, n: SyntaxNode, read: ReadDefinitions, bodies: Map<string, string>): boolean {
	const { names } = read;
	const word = code.slice(n.from + 1, n.to);
	if (PRIMITIVE_DEFINERS.has(word) || EXPL_FUNCTION_DEFINER.test(word)) readPrimitiveDef(code, n, read, bodies);
	if (DEFINER.test(word)) {
		let s = nextItem(code, n);
		if (isStar(code, s)) s = nextItem(code, s!);
		if (s?.name === 'OpenBracket') s = bracketEnd(s) && nextItem(code, bracketEnd(s)!);
		const inGroup = s?.name === 'Group' ? groupItems(code, s)[0] : null;
		const name = wordOf(code, inGroup ?? s);
		if (name && s) {
			names.add(name);
			read.spans.push([n.from, inGroup ? inGroup.to : argumentsEnd(code, s)]);
		}
	}
	let dynamic = false;
	if (CSNAME_DEFINER.test(word)) {
		const literal = csnameLiteral(code, n);
		if (literal) read.prefixes.push(literal);
		else if (literal === '') dynamic = true;
	}
	const tested = testedName(code, word, n);
	if (tested) names.add(tested);
	if (word === 'foreach') for (const name of loopVariables(code, n)) names.add(name);
	if (CSV_ROW.has(word)) for (const m of csvColumns(code, n).matchAll(CSV_COLUMN)) names.add(m[1]);
	const next = nextItem(code, n);
	if (word === 'typein' && next?.name === 'OpenBracket') {
		const name = wordOf(code, nextItem(code, next));
		if (name) names.add(name);
	}
	const flag = word === 'newif' ? namedCommand(code, next)?.replace(/^if/, '') : word === 'newboolean' ? plainWordOf(code, next) : null;
	if (flag) for (const name of [`if${flag}`, `${flag}true`, `${flag}false`]) names.add(name);
	if (word === '@namedef' || word === 'namedef') {
		const first = next?.name === 'Group' ? groupItems(code, next)[0] : null;
		const literal = first?.name === 'Text' ? code.slice(first.from, first.to) : '';
		if (literal) read.prefixes.push(literal);
		else dynamic = true;
	}
	return dynamic;
}

/** comment-masked `code` (codeOnly) */
export function readDefinitions(code: string): ReadDefinitions {
	if (last?.code === code) return last.read;
	const read: ReadDefinitions = { names: new Set<string>(), prefixes: [], dynamic: false, spans: [] };
	const wrappers = new Set<string>();
	const bodies = new Map<string, string>();
	readDefinerCalls(code, read, wrappers, bodies);
	let csname = -1;
	const used: SyntaxNode[] = [];
	latexTreeOf(code).iterate({
		enter(n) {
			if (n.name === 'Environment' && BIBLIOGRAPHY.test(environmentName(code, n.node.firstChild!))) read.spans.push([n.from, n.to]);
			if (n.name !== 'ControlWord') return;
			const word = code.slice(n.from + 1, n.to);
			if (word === 'csname') csname = n.from;
			else if (word === 'endcsname' && csname >= 0) {
				read.spans.push([csname, n.to]);
				csname = -1;
			}
			if (readCommand(code, n.node, read, bodies)) read.dynamic = true;
			used.push(n.node);
		}
	});
	for (const [name, body] of bodies) if (DEFINING_BODY.test(body)) wrappers.add(name);
	for (const m of code.includes('let') ? code.matchAll(TIKZ_LET) : []) {
		for (const operand of m[1].matchAll(TIKZ_OPERAND)) {
			read.names.add(operand[1]);
			if (operand[1] === 'p') for (const n of ['x', 'y']) read.names.add(n);
		}
	}
	wrapperChains(wrappers, bodies);
	if (wrappers.size) for (const n of used) if (wrappers.has(code.slice(n.from + 1, n.to))) wrapperTargets(code, n, read.names);
	last = { code, read };
	return read;
}

export function definedNamesIn(text: string): DefinedNames {
	const { names, prefixes, dynamic } = readDefinitions(codeOnly(text));
	return { names, prefixes, dynamic };
}

export function mergeDefinedNames(parts: DefinedNames[]): DefinedNames {
	return {
		names: new Set(parts.flatMap((p) => [...p.names])),
		prefixes: parts.flatMap((p) => p.prefixes),
		dynamic: parts.some((p) => p.dynamic)
	};
}
