// user \newcommand-family definitions as a MathLive macro dictionary, so the math preview and
// \ref hover render custom macros instead of erroring on them. bodies keep LaTeX's native #1
// placeholders, which is exactly MathLive's MacroDefinition format.
import { get } from 'svelte/store';
import { projectIntelStore } from '$lib/stores/projectIntel';

export interface MacroDef {
	def: string;
	args?: number;
}

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

const NEWCOMMAND = /\\(?:new|renew|provide)command\*?\s*\{?\\([a-zA-Z@]+)\}?\s*(?:\[(\d)\])?\s*(?:\[[^\]]*\]\s*)?(?=\{)/g;
const MATH_OPERATOR = /\\DeclareMathOperator(\*?)\{\\([a-zA-Z@]+)\}\s*(?=\{)/g;
const PAIRED_DELIMITER = /\\DeclarePairedDelimiter\s*\{?\\([a-zA-Z@]+)\}?\s*(?=\{)/g;

/** scans text for renderable macro definitions. pure; cross-file merging happens in mathMacrosFor. */
export function scanMacroDefinitions(text: string): Record<string, MacroDef> {
	const out: Record<string, MacroDef> = {};

	NEWCOMMAND.lastIndex = 0;
	for (let m = NEWCOMMAND.exec(text); m; m = NEWCOMMAND.exec(text)) {
		const group = balancedGroup(text, m.index + m[0].length);
		if (group) out[m[1]] = { def: group.body, args: m[2] ? +m[2] : 0 };
	}
	MATH_OPERATOR.lastIndex = 0;
	for (let m = MATH_OPERATOR.exec(text); m; m = MATH_OPERATOR.exec(text)) {
		const group = balancedGroup(text, m.index + m[0].length);
		if (group) out[m[2]] = { def: `\\operatorname${m[1]}{${group.body}}`, args: 0 };
	}
	PAIRED_DELIMITER.lastIndex = 0;
	for (let m = PAIRED_DELIMITER.exec(text); m; m = PAIRED_DELIMITER.exec(text)) {
		const left = balancedGroup(text, m.index + m[0].length);
		const right = left ? balancedGroup(text, left.end) : null;
		if (left && right) out[m[1]] = { def: `${left.body}#1${right.body}`, args: 1 };
	}
	return out;
}

let cache: { text: string; intel: unknown; macros: Record<string, MacroDef> } | null = null;

/** buffer definitions merged over cross-file ones (buffer wins), cached per doc text. */
export function mathMacrosFor(docText: string): Record<string, MacroDef> {
	const intel = get(projectIntelStore);
	if (cache && cache.text === docText && cache.intel === intel) return cache.macros;
	const macros: Record<string, MacroDef> = {};
	for (const m of intel.macros) {
		if (m.definition !== undefined) macros[m.name] = { def: m.definition, args: m.argCount ?? 0 };
	}
	Object.assign(macros, scanMacroDefinitions(docText));
	cache = { text: docText, intel, macros };
	return macros;
}
