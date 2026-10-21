// a call of the paper's own macro, read by its definition
import type { MacroDef } from '$lib/editor/source/extensions/math-preview/userMacros';
import { codeOnly } from '$lib/languages/latex/texCode';

/** null is an optional argument left out */
export type OwnMacroArgument = { text: string; from: number; to: number; braced: boolean } | null;
export type OwnMacroCall = { name: string; nameEnd: number; args: OwnMacroArgument[] };

const NAME = /^\s*\\([a-zA-Z@]+)/;
const TOKEN = /\\(?:[a-zA-Z@]+|.)|[^\s{}[\]%#\\]/y;

export function macroCallName(source: string): string | null {
	return NAME.exec(source)?.[1] ?? null;
}

function closing(source: string, open: number): number {
	let depth = 0;
	for (let i = open + 1; i < source.length; i++) {
		const ch = source[i];
		if (ch === '\\') i++;
		else if (ch === '{') depth++;
		else if (ch === '}') {
			if (depth === 0) return source[open] === '{' ? i : -1;
			depth--;
		} else if (ch === ']' && depth === 0 && source[open] === '[') return i;
	}
	return -1;
}

function skipSpaces(source: string, from: number): number {
	let at = from;
	while (/\s/.test(source[at] ?? '')) at++;
	return at;
}

function unbraced(source: string, at: number): OwnMacroArgument {
	TOKEN.lastIndex = at;
	const token = TOKEN.exec(source);
	return token ? { text: token[0], from: at, to: at + token[0].length, braced: false } : null;
}

function readCallAt(source: string, nameEnd: number, definition: MacroDef): { args: OwnMacroArgument[]; end: number } | null {
	const args: OwnMacroArgument[] = [];
	let at = nameEnd;
	for (let i = 0; i < (definition.args ?? 0); i++) {
		const optional = i === 0 && definition.optional !== undefined;
		const open = skipSpaces(source, at);
		if (optional && source[open] !== '[') {
			args.push(null);
			continue;
		}
		const close = source[open] === (optional ? '[' : '{') ? closing(source, open) : -1;
		const arg =
			close < 0
				? optional
					? null
					: unbraced(source, open)
				: { text: source.slice(open + 1, close), from: open + 1, to: close, braced: true };
		if (!arg) return null;
		args.push(arg);
		at = arg.braced ? arg.to + 1 : arg.to;
	}
	return { args, end: at };
}

export function readOwnMacroCall(source: string, definition: MacroDef): OwnMacroCall | null {
	const head = NAME.exec(source);
	const read = head && readCallAt(source, head[0].length, definition);
	if (!head || !read) return null;
	// \bert{} prints what \bert does
	const rest = source.slice(read.end);
	const ends = /^\s*$/.test(rest) || (!read.args.length && /^\{\}\s*$/.test(rest));
	return ends ? { name: head[1], nameEnd: head[0].length, args: read.args } : null;
}

/** the calls MathLive boxes: none inside another own macro's arguments, null for one that does not read */
export function ownMacroCallsIn(
	latex: string,
	name: string,
	definitionOf: (name: string) => MacroDef | null
): ({ from: number; to: number } | null)[] {
	const code = codeOnly(latex);
	const calls: ({ from: number; to: number } | null)[] = [];
	let inside = 0;
	for (const found of code.matchAll(/\\(?:([a-zA-Z@]+)|[^])/g)) {
		const definition = found[1] && found.index >= inside ? definitionOf(found[1]) : null;
		if (!definition) continue;
		const read = readCallAt(code, found.index + found[0].length, definition);
		if (read) inside = read.end;
		if (found[1] === name) calls.push(read && { from: found.index, to: read.end });
	}
	return calls;
}

export function expandOwnMacro(definition: MacroDef, call: OwnMacroCall): string {
	return definition.def.replace(/#(#|[1-9])/g, (all, k: string) => {
		if (k === '#') return '#';
		const arg = call.args[Number(k) - 1];
		if (arg) return arg.text;
		return k === '1' && definition.optional !== undefined ? definition.optional : all;
	});
}
