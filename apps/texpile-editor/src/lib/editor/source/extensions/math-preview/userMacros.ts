// user macro definitions as a MathLive macro dictionary, so the math preview and
// \ref hover render custom macros instead of erroring on them. bodies keep LaTeX's native #1
// placeholders, which is exactly MathLive's MacroDefinition format.
import { projectIntelStore } from '$lib/stores/projectIntel';
import { callsIn, rolesOf, type CommandCall } from '$lib/languages/latex/knowledge/calls/commandCalls';
import type { Argument, Role } from '$lib/languages/latex/knowledge/types';
import { codeOnly } from '$lib/languages/latex/texCode';
import { definedIn, primitiveDefsIn } from '$lib/languages/latex/userDefinitions';

export type MacroDef = {
	def: string;
	args?: number;
	/** the default of #1, which makes it optional: \newcommand{\a}[2][10]{...} */
	optional?: string;
};

const MAX_BODY = 500; // a "macro" body longer than this is not something a preview should inline

/** reads the {…} group starting at text[open], balanced; null when unclosed or oversized. */
export function balancedGroup(text: string, open: number): { body: string; end: number } | null {
	if (text[open] !== '{') return null;
	let depth = 0;
	for (let i = open; i < text.length && i - open <= MAX_BODY + 2; i++) {
		const ch = text[i];
		if (ch === '\\') i++;
		else if (ch === '{') depth++;
		else if (ch === '}' && --depth === 0) return { body: text.slice(open + 1, i), end: i + 1 };
	}
	return null;
}

// \newcommand{\a}[2][10]{...}: every argument is mandatory except an optional first one, the only shape MathLive inlines
function inlinable(args: Argument[]): boolean {
	return args.every((a, i) => a.kind === 'm' || (i === 0 && a.kind === 'o' && a.default !== undefined));
}

// what a definer expands to instead of inlining its body, from the arguments after its name by role
const EXPANSIONS: Record<string, (star: boolean, parts: Partial<Record<Role, string>>) => MacroDef | null> = {
	DeclareMathOperator: (star, { body }) => (body === undefined ? null : { def: `\\operatorname${star ? '*' : ''}{${body}}`, args: 0 }),
	DeclarePairedDelimiter: (_, { begin, end }) => (begin === undefined || end === undefined ? null : { def: `${begin}#1${end}`, args: 1 })
};

type FoundMacro = { at: number; name: string; def: MacroDef; provide: boolean };

function expansionOf(code: string, call: CommandCall | undefined): MacroDef | null {
	const named = call?.args.find((a) => a.arg.defines && rolesOf(a.arg).includes('macro'));
	if (!call || !named) return null;
	const parts: Partial<Record<Role, string>> = {};
	for (const a of call.args) {
		if (a.index > named.index && a.arg.kind === 'm') for (const role of rolesOf(a.arg)) parts[role] = code.slice(a.from, a.to);
	}
	if (Object.values(parts).some((p) => p.length > MAX_BODY)) return null;
	return (
		EXPANSIONS[call.command]?.(
			call.args.some((a) => a.arg.kind === 's'),
			parts
		) ?? null
	);
}

/** scans comment-masked `code` for renderable macro definitions, a later one replacing an earlier */
export function scanMacroBodies(code: string): Record<string, MacroDef> {
	const found: FoundMacro[] = [];
	let calls: Map<number, CommandCall> | null = null;
	for (const d of definedIn(code, 'macro')) {
		let def: MacroDef | null = null;
		if (d.command in EXPANSIONS) {
			calls ??= new Map(callsIn(code, ['macro']).map((c) => [c.at, c]));
			def = expansionOf(code, calls.get(d.at));
		} else if (d.body !== undefined) {
			const first = d.args[0];
			if (d.body.length <= MAX_BODY && inlinable(d.args)) {
				def = { def: d.body, args: d.args.length, ...(first?.kind === 'o' ? { optional: first.default } : {}) };
			}
		}
		if (def) found.push({ at: d.at, name: d.name, def, provide: d.defines === 'provide' });
	}
	for (const d of primitiveDefsIn(code)) {
		const group = d.bodyAt === null ? null : balancedGroup(code, d.bodyAt);
		if (group) found.push({ at: d.at, name: d.name, def: { def: group.body, args: d.params ?? 0 }, provide: false });
	}
	const out: Record<string, MacroDef> = {};
	for (const f of found.sort((a, b) => a.at - b.at)) if (!(f.provide && f.name in out)) out[f.name] = f.def;
	return out;
}

/** scans text for renderable macro definitions. pure; cross-file merging happens in mathMacrosFor. */
export function scanMacroDefinitions(text: string): Record<string, MacroDef> {
	return scanMacroBodies(codeOnly(text));
}

let cache: { text: string; intel: unknown; macros: Record<string, MacroDef> } | null = null;

/** buffer definitions merged over cross-file ones (buffer wins), cached per doc text. */
export function mathMacrosFor(docText: string): Record<string, MacroDef> {
	const intel = projectIntelStore.current;
	if (cache && cache.text === docText && cache.intel === intel) return cache.macros;
	const macros: Record<string, MacroDef> = {};
	for (const m of intel.macros) {
		if (m.definition !== undefined) macros[m.name] = { def: m.definition, args: m.argCount ?? 0, optional: m.optional };
	}
	Object.assign(macros, scanMacroDefinitions(docText));
	cache = { text: docText, intel, macros };
	return macros;
}
