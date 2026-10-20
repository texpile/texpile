// the control sequences a text defines itself, with the spans of the code that defines them
import { definerCallsIn, definitionsIn, derivedDefinitionsIn, environmentDefinitionsIn } from '../../../knowledge/calls/definitions';
import { environmentCallsIn } from '../../../knowledge/calls/commandCalls';
import { codeOnly } from '../../../texCode';

/** prefixes: names written with a \csname that ends in other tokens; dynamic: a definition names its command by tokens alone */
export type DefinedNames = { names: Set<string>; prefixes: string[]; dynamic: boolean };

// a definer the data does not know still names what it defines first: \DeclareSIUnit\molar{M}, \newcommand*{\x}
const DEFINER =
	'(?:[gex]?def|let|futurelet|(?:char|mathchar|count|dimen|skip|muskip|toks)def|font|(?:re|provide)?new(?!line|page)[A-Za-z]*|(?:Declare|Provide|Renew|New)[A-Za-z]*|urldef)';
const DEFINED_FIRST = new RegExp(`\\\\${DEFINER}(?![A-Za-z@])\\*?\\s*(?:\\[[^\\]]*\\]\\s*)?\\{?\\s*\\\\([A-Za-z]+)`, 'g');
const DEFINING_BODY = new RegExp(`\\\\${DEFINER}(?![A-Za-z@])`);
// \def\bal#1\eal{...}: what follows the name up to the body is parameter text, whose control words are delimiters
const DEF = /\\[gex]?def\s*\\(?:([A-Za-z@]+)|[^A-Za-z@])([^{}]{0,120})\{/g;
// csvsimple's \csvreader{file}{Label=\Label,5=\Size}{...} names the macros a row fills
const CSV_ROW = /\\csv(?:reader|loop|useHeadTab|process)(?![A-Za-z@])/g;
const CSV_COLUMN = /=\s*\\([A-Za-z]+)/g;
// tikz's `let \p1 = (0,0), \n2 = {5} in ...` defines \p1 with \x1 and \y1, and \n2
const TIKZ_LET = /(?<![\\A-Za-z@])let\s+(\\[A-Za-z]+(?:\d+|\{[^{}]*\})\s*=[^]{0,600}?)\bin\b/g;
const TIKZ_OPERAND = /\\([A-Za-z]+)(?:\d+|\{[^{}]*\})\s*=/g;
const TYPEIN = /\\typein\s*\[\s*\\([A-Za-z]+)\s*\]/g;
// a name the document tests for before it uses it
const TESTED =
	/\\@?ifundefined\s*\{\s*([A-Za-z@]+)\s*\}|\\(?:ifdef|ifundef)\s*\{\s*\\([A-Za-z@]+)|\\ifdefined\s*\\([A-Za-z@]+)|\\ifx\s*\\([A-Za-z@]+)\s*\\(?:undefined|relax)(?![A-Za-z@])/g;
const NEW_IF = /\\newif\s*\{?\s*\\if([A-Za-z]+)/g;
const NEW_BOOLEAN = /\\newboolean\s*\{([A-Za-z]+)\}/g;
const FOREACH = /\\foreach\s*((?:\\[A-Za-z]+\s*(?:\/\s*)?)+)(?:\[[^\]]*\]\s*)?in\b/g;
const COMMAND_NAMED = /\\@?namedef\s*\{([^{}\\]*)/g;
const CSNAME_DEFINITION =
	/\\(?:[gex]?def|let|(?:re|provide)?newcommand\*?|DeclareRobustCommand|(?:New|Renew|Provide|Declare)DocumentCommand)\s*\{?\s*\\csname\s*([^\\{}]*)/g;
const EXPL = /\\ExplSyntaxOn[^]*?(?:\\ExplSyntaxOff|$)/g;
// the names expl3 spells with _ and :, which the command check cannot tell from a command followed by text
const EXPL_NAME = /\\[A-Za-z]*[_:][A-Za-z_:]*/g;
// \cs_new:Npn \mine {..} defines a plain name like \def does
const EXPL_FUNCTION_DEFINER = /^\\cs_g?(?:new|set)[a-z_]*:N[pn]/;
const BIBLIOGRAPHY = /\\begin\{[A-Za-z]*bibliography\*?\}[^]*?(?:\\end\{[A-Za-z]*bibliography\*?\}|$)/g;

/** the text with the names expl3 spells with `_` and `:` blanked in its regions */
export function withoutExpl(code: string): string {
	return code.includes('\\ExplSyntaxOn')
		? code.replace(EXPL, (region) =>
				region.replace(EXPL_NAME, (name) => (EXPL_FUNCTION_DEFINER.test(name) ? '\\def'.padEnd(name.length) : ' '.repeat(name.length)))
			)
		: code;
}

function groupEnd(code: string, open: number): number {
	let depth = 0;
	for (let i = open; i < code.length; i++) {
		if (code[i] === '\\') i++;
		else if (code[i] === '{') depth++;
		else if (code[i] === '}' && --depth === 0) return i + 1;
	}
	return code.length;
}

// the options and the file and column groups of a \csvreader call, the body that follows them left out
function csvColumns(code: string, from: number): string {
	let at = from;
	let out = '';
	function skipSpace(): void {
		while (/\s/.test(code[at] ?? '')) at++;
	}
	skipSpace();
	if (code[at] === '[') {
		const close = code.indexOf(']', at);
		if (close < 0) return out;
		out += code.slice(at, close);
		at = close + 1;
	}
	for (let n = 0; n < 2; n++) {
		skipSpace();
		if (code[at] !== '{') break;
		const end = groupEnd(code, at);
		out += ` ${code.slice(at, end)}`;
		at = end;
	}
	return out;
}

// the groups after a definer's name: [default] {body} {end}
function argumentsEnd(code: string, from: number): number {
	let end = from;
	for (let n = 0; n < 4; n++) {
		const at = end + (/^\s*/.exec(code.slice(end, end + 50))?.[0].length ?? 0);
		if (code[at] === '{') end = groupEnd(code, at);
		else if (code[at] === '[') end = code.indexOf(']', at) + 1 || end;
		else if (code[at] !== '*' || n > 0) break;
		else end = at + 1;
	}
	return end;
}

// a macro defined to define others (\MyPairedDelimiter*{\abs}{\lvert}{\rvert}) names what it defines in its arguments
function wrapperTargets(code: string, wrappers: Set<string>, names: Set<string>): void {
	if (!wrappers.size) return;
	const call = new RegExp(`\\\\(?:${[...wrappers].join('|')})(?![A-Za-z@])`, 'g');
	for (const m of code.matchAll(call)) {
		let at = m.index + m[0].length;
		let named = false;
		for (let n = 0; n < 4; n++) {
			const arg = /^\s*(?:\*|\[[^\]]*\]|\{\s*\\([A-Za-z]+)\s*\}|\\([A-Za-z]+)|\{\s*([A-Za-z@]+)\s*\}|\{[^{}]*\})/.exec(
				code.slice(at, at + 200)
			);
			if (!arg) break;
			const name = arg[1] ?? arg[2] ?? (named ? undefined : arg[3]);
			if (name) names.add(name);
			// \newsiamthm{lemma}{Lemma} names an environment in its first group
			if (arg[0].trimStart().startsWith('{')) named = true;
			at += arg[0].length;
		}
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

// a literal is found much faster than a pattern is searched for
function matchesOf(code: string, literal: string, pattern: RegExp): RegExpExecArray[] {
	return code.includes(literal) ? [...code.matchAll(pattern)] : [];
}

/** spans: where each definition's own text stands, the names and bodies a use inside is no use of */
export type ReadDefinitions = DefinedNames & { spans: [number, number][] };

let last: { code: string; read: ReadDefinitions } | null = null;

/** comment-masked `code` (codeOnly) */
export function readDefinitions(code: string): ReadDefinitions {
	if (last?.code === code) return last.read;
	const names = new Set<string>();
	const read: ReadDefinitions = { names, prefixes: [], dynamic: false, spans: [] };
	const wrappers = new Set<string>();
	const bodies = new Map<string, string>();
	const calls = definerCallsIn(code);
	// a call that only names one (\AtBeginEnvironment{itemize}{code}) holds uses like any other text
	for (const c of calls) if (c.args.some((a) => a.arg.defines)) read.spans.push([c.at, c.end]);
	for (const c of environmentCallsIn(code, ['macro', 'environment', 'counter', 'derives'])) read.spans.push([c.at, c.end]);
	for (const d of [...definitionsIn(code, calls), ...environmentDefinitionsIn(code), ...derivedDefinitionsIn(code)]) {
		// \newenvironment{rep#1} inside a wrapper defines every name that starts with rep; a bare #1 is the wrapper's to resolve
		const parameter = d.name.indexOf('#');
		if (parameter > 0) read.prefixes.push(d.name.slice(0, parameter));
		names.add(d.name);
		if (d.kind !== 'macro') names.add(`the${d.name}`);
		else if (d.body) {
			bodies.set(d.name, d.body);
			if (DEFINING_BODY.test(d.body)) wrappers.add(d.name);
		}
	}
	for (const m of code.matchAll(DEF)) {
		if (m[1]) names.add(m[1]);
		for (const delimiter of m[2].matchAll(/\\([A-Za-z]+)/g)) names.add(delimiter[1]);
		const body = groupEnd(code, m.index + m[0].length - 1);
		read.spans.push([m.index, body]);
		if (m[1]) bodies.set(m[1], code.slice(m.index + m[0].length, body));
		if (m[1] && DEFINING_BODY.test(bodies.get(m[1])!)) wrappers.add(m[1]);
	}
	for (const m of code.matchAll(DEFINED_FIRST)) {
		names.add(m[1]);
		read.spans.push([m.index, argumentsEnd(code, m.index + m[0].length)]);
	}
	for (const m of matchesOf(code, 'bibliography', BIBLIOGRAPHY)) read.spans.push([m.index, m.index + m[0].length]);
	for (const m of matchesOf(code, '\\csname', /\\csname/g)) {
		const close = code.indexOf('\\endcsname', m.index);
		if (close >= 0) read.spans.push([m.index, close + '\\endcsname'.length]);
	}
	for (const call of matchesOf(code, '\\csv', CSV_ROW)) {
		for (const m of csvColumns(code, call.index + call[0].length).matchAll(CSV_COLUMN)) names.add(m[1]);
	}
	for (const m of matchesOf(code, 'let', TIKZ_LET)) {
		for (const operand of m[1].matchAll(TIKZ_OPERAND)) {
			names.add(operand[1]);
			if (operand[1] === 'p') for (const n of ['x', 'y']) names.add(n);
		}
	}
	for (const m of matchesOf(code, 'typein', TYPEIN)) names.add(m[1]);
	for (const m of code.matchAll(TESTED)) names.add(m[1] ?? m[2] ?? m[3] ?? m[4]);
	for (const m of matchesOf(code, 'newif', NEW_IF)) for (const n of [`if${m[1]}`, `${m[1]}true`, `${m[1]}false`]) names.add(n);
	for (const m of matchesOf(code, 'newboolean', NEW_BOOLEAN)) for (const n of [`if${m[1]}`, `${m[1]}true`, `${m[1]}false`]) names.add(n);
	for (const m of matchesOf(code, 'foreach', FOREACH)) for (const v of m[1].matchAll(/\\([A-Za-z]+)/g)) names.add(v[1]);
	for (const m of matchesOf(code, 'namedef', COMMAND_NAMED)) {
		if (m[1]) read.prefixes.push(m[1]);
		else read.dynamic = true;
	}
	for (const m of matchesOf(code, '\\csname', CSNAME_DEFINITION)) {
		const literal = m[1].trim();
		if (literal) read.prefixes.push(literal);
		else read.dynamic = true;
	}
	wrapperChains(wrappers, bodies);
	wrapperTargets(code, wrappers, names);
	last = { code, read };
	return read;
}

export function definedNamesIn(text: string): DefinedNames {
	const { names, prefixes, dynamic } = readDefinitions(withoutExpl(codeOnly(text)));
	return { names, prefixes, dynamic };
}

export function mergeDefinedNames(parts: DefinedNames[]): DefinedNames {
	return {
		names: new Set(parts.flatMap((p) => [...p.names])),
		prefixes: parts.flatMap((p) => p.prefixes),
		dynamic: parts.some((p) => p.dynamic)
	};
}
