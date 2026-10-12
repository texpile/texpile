// { v: 1, variables?, snippets } or a bare VS Code snippet file, read as JSONC
import {
	SNIPPET_LANGUAGES,
	type Snippet,
	type SnippetContext,
	type SnippetFile,
	type SnippetLanguage,
	type SnippetLayer,
	type SnippetProblem,
	type SnippetVariables
} from './snippetTypes';
import { usesSelection } from '../expand/body/bodyNodes';
import { readCallLook } from './readCallLook';

const CONTEXTS: readonly SnippetContext[] = ['math', 'inline-math', 'display-math', 'text', 'code', 'any'];
const LANGUAGE_IDS: Record<string, SnippetLanguage> = {
	latex: 'latex',
	tex: 'latex',
	typst: 'typst',
	markdown: 'markdown',
	md: 'markdown'
};
export const FUNCTION_NAME = /^[\p{L}_][\p{L}\p{N}_.-]*$/u;

export function stripJsonc(text: string): string {
	let out = '';
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (c === '"') {
			const start = i;
			for (i++; i < text.length && text[i] !== '"'; i++) if (text[i] === '\\') i++;
			out += text.slice(start, i + 1);
		} else if (c === '/' && text[i + 1] === '/') {
			const end = text.indexOf('\n', i);
			const stop = end < 0 ? text.length : end;
			out += ' '.repeat(stop - i);
			i = stop - 1;
		} else if (c === '/' && text[i + 1] === '*') {
			const end = text.indexOf('*/', i + 2);
			const stop = end < 0 ? text.length : end + 2;
			out += text.slice(i, stop).replace(/[^\n]/g, ' ');
			i = stop - 1;
		} else {
			// blanked rather than cut, so a JSON error's position is the file's
			if (c === '}' || c === ']') out = out.replace(/,(\s*)$/, ' $1');
			out += c;
		}
	}
	return out;
}

function isObject(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function textOf(v: unknown): string | null {
	if (typeof v === 'string') return v;
	if (Array.isArray(v) && v.every((line) => typeof line === 'string')) return v.join('\n');
	return null;
}

/** null: a scope for other editors only */
function scopeOf(v: unknown): SnippetLanguage[] | null {
	if (v === undefined) return [...SNIPPET_LANGUAGES];
	if (typeof v !== 'string') return null;
	const langs = v
		.split(',')
		.map((id) => LANGUAGE_IDS[id.trim().toLowerCase()])
		.filter(Boolean);
	return langs.length ? [...new Set(langs)] : null;
}

type EntryResult = { snippet: Snippet } | { disabled: true } | { problem: string } | { skip: true };

function readEntry(name: string, raw: unknown, layer: SnippetLayer): EntryResult {
	if (!isObject(raw)) return { problem: 'Each entry needs to be in { }, like "Name": { "prefix": "ff", "body": "text" }.' };
	if (raw.disabled === true) return { disabled: true };
	const scope = scopeOf(raw.scope);
	if (!scope)
		return typeof raw.scope === 'string' ? { skip: true } : { problem: '"scope" needs to be text naming languages, like "latex,typst".' };

	const wrap = raw.wrap;
	if (wrap !== undefined && (typeof wrap !== 'string' || !FUNCTION_NAME.test(wrap)))
		return { problem: '"wrap" needs to be just a function name, like "rev", without a backslash or #.' };

	const bodies: Snippet['bodies'] = {};
	if (isObject(raw.body)) {
		for (const [lang, body] of Object.entries(raw.body)) {
			const id = LANGUAGE_IDS[lang.toLowerCase()];
			const text = textOf(body);
			if (!id) return { problem: `"body" has "${lang}", which is not a language. Use "latex", "typst" or "markdown".` };
			if (text === null) return { problem: `The ${lang} "body" needs to be text in quotes.` };
			if (scope.includes(id)) bodies[id] = text;
		}
	} else if (raw.body !== undefined) {
		const text = textOf(raw.body);
		if (text === null) return { problem: '"body" needs to be text in quotes, or one text each for "latex", "typst" and "markdown".' };
		for (const lang of scope) bodies[lang] = text;
	} else if (!wrap) return { problem: 'Has no "body", the text it inserts.' };

	const prefixes = typeof raw.prefix === 'string' ? [raw.prefix] : raw.prefix;
	if (prefixes !== undefined && (!Array.isArray(prefixes) || !prefixes.every((p) => typeof p === 'string' && p))) {
		return { problem: '"prefix" needs to be text in quotes, or a list of them in [ ].' };
	}
	const key = raw.key;
	let visual: Snippet['visual'];
	if (raw.visual !== undefined) {
		if (!wrap) return { problem: '"visual" only works together with "wrap", the function whose calls it draws.' };
		const read = readCallLook(raw.visual);
		if (typeof read === 'string') return { problem: read };
		visual = read;
	}
	const wraps = !!wrap || Object.values(bodies).some(usesSelection);
	if (!prefixes?.length && !wraps && typeof key !== 'string') return { problem: 'Has no "prefix", the text you type to use it.' };

	const context = raw.context ?? 'any';
	if (!CONTEXTS.includes(context as SnippetContext))
		return { problem: `"context" needs to be one of ${CONTEXTS.map((c) => `"${c}"`).join(', ')}.` };
	for (const flag of ['auto', 'word', 'regex'] as const) {
		if (raw[flag] !== undefined && typeof raw[flag] !== 'boolean')
			return { problem: `"${flag}" needs to be true or false, without quotes.` };
	}
	const flags = raw.flags ?? '';
	if (typeof flags !== 'string' || !/^[iu]*$/.test(flags)) return { problem: '"flags" can only hold i (ignore case) and u (Unicode).' };
	if (raw.priority !== undefined && typeof raw.priority !== 'number')
		return { problem: '"priority" needs to be a number, without quotes.' };
	if (key !== undefined && typeof key !== 'string') return { problem: '"key" needs to be text, like "Mod-Shift-o".' };
	if (raw.args !== undefined && typeof raw.args !== 'string') return { problem: '"args" needs to be text, like "fill: red".' };
	if (raw.description !== undefined && typeof raw.description !== 'string') return { problem: '"description" needs to be text in quotes.' };
	// markdown math is latex, as the built-in @ snippets have it
	if ((context as SnippetContext).includes('math') && bodies.latex !== undefined && scope.includes('markdown'))
		bodies.markdown ??= bodies.latex;

	const langs = wrap ? scope.filter((l) => l !== 'markdown') : (Object.keys(bodies) as SnippetLanguage[]);
	if (!langs.length) return { skip: true };
	if (wrap) for (const lang of langs) bodies[lang] ??= '';

	return {
		snippet: {
			name,
			layer,
			prefixes: prefixes ?? [],
			bodies,
			description: (raw.description as string | undefined) ?? '',
			context: context as SnippetContext,
			auto: raw.auto === true,
			word: raw.word as boolean | undefined,
			regex: raw.regex === true,
			flags,
			priority: (raw.priority as number | undefined) ?? 0,
			key: key as string | undefined,
			wrap: wrap as string | undefined,
			args: raw.args as string | undefined,
			visual
		}
	};
}

function readVariables(raw: unknown, layer: SnippetLayer, problems: SnippetProblem[]): SnippetVariables {
	const out: SnippetVariables = {};
	if (raw === undefined) return out;
	if (!isObject(raw)) {
		problems.push({ layer, name: 'variables', reason: 'Needs to be in { }, with a named list in each entry.' });
		return out;
	}
	for (const [name, value] of Object.entries(raw)) {
		if (typeof value === 'string') out[name] = Object.fromEntries(SNIPPET_LANGUAGES.map((l) => [l, value]));
		else if (isObject(value) && Object.values(value).every((v) => typeof v === 'string')) {
			out[name] = Object.fromEntries(
				Object.entries(value).flatMap(([lang, v]) => (LANGUAGE_IDS[lang.toLowerCase()] ? [[LANGUAGE_IDS[lang.toLowerCase()], v]] : []))
			);
		} else problems.push({ layer, name: `variables.${name}`, reason: 'Needs to be text, or one text per language.' });
	}
	return out;
}

/** why `text` is not JSON, and where */
export function notJson(text: string, error: unknown): string {
	return `The file is not valid JSON: ${jsonErrorAt(text, (error as Error).message)}.`;
}

/** a JSON.parse message with its character offset as a line and column of `text` */
export function jsonErrorAt(text: string, message: string): string {
	const at = /\s*in JSON at position (\d+)(?: \(line \d+ column \d+\))?/.exec(message);
	if (!at) return message;
	const before = text.slice(0, Number(at[1]));
	const line = before.split('\n').length;
	const column = before.length - before.lastIndexOf('\n');
	return `line ${line}, column ${column} (${message.slice(0, at.index)}${message.slice(at.index + at[0].length)})`;
}

export function parseSnippetFile(text: string, layer: SnippetLayer): SnippetFile {
	const file: SnippetFile = { snippets: [], disabled: [], variables: {}, problems: [] };
	let parsed: unknown;
	try {
		parsed = JSON.parse(stripJsonc(text));
	} catch (e) {
		file.problems.push({ layer, name: '', reason: notJson(text, e), whole: true });
		return file;
	}
	if (!isObject(parsed)) {
		file.problems.push({ layer, name: '', reason: 'The file needs to start with { and end with }.', whole: true });
		return file;
	}
	const wrapped = isObject(parsed.snippets) && !('body' in parsed.snippets);
	if (wrapped && parsed.v !== undefined && parsed.v !== 1) {
		file.problems.push({
			layer,
			name: '',
			reason: `Unsupported file version ("v": ${String(parsed.v)}).`,
			whole: true
		});
		return file;
	}
	const entries = (wrapped ? parsed.snippets : parsed) as Record<string, unknown>;
	if (wrapped) file.variables = readVariables(parsed.variables, layer, file.problems);
	for (const [name, raw] of Object.entries(entries)) {
		if (!wrapped && (name === 'v' || name === 'variables')) continue;
		const result = readEntry(name, raw, layer);
		if ('snippet' in result) file.snippets.push(result.snippet);
		else if ('disabled' in result) file.disabled.push(name);
		else if ('problem' in result) file.problems.push({ layer, name, reason: result.problem });
	}
	return file;
}
