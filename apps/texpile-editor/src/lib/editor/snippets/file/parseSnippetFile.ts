// a snippet file: { v: 1, variables?, snippets: {...} }, or a bare VS Code snippet file. read as
// JSONC, as VS Code reads its own; nothing that fails a check is ever written back corrected
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
import { usesSelection } from '../expand/bodyTemplate';
import { readCallLook } from './readCallLook';

const CONTEXTS: readonly SnippetContext[] = ['math', 'inline-math', 'display-math', 'text', 'code', 'any'];
const LANGUAGE_IDS: Record<string, SnippetLanguage> = {
	latex: 'latex',
	tex: 'latex',
	typst: 'typst',
	markdown: 'markdown',
	md: 'markdown'
};
const FUNCTION_NAME = /^[\p{L}_][\p{L}\p{N}_.-]*$/u;

/** comments and trailing commas out, strings left alone */
export function stripJsonc(text: string): string {
	let out = '';
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (c === '"') {
			const start = i;
			for (i++; i < text.length && text[i] !== '"'; i++) if (text[i] === '\\') i++;
			out += text.slice(start, i + 1);
		} else if (c === '/' && text[i + 1] === '/') {
			while (i < text.length && text[i] !== '\n') i++;
			out += '\n';
		} else if (c === '/' && text[i + 1] === '*') {
			const end = text.indexOf('*/', i + 2);
			i = end < 0 ? text.length : end + 1;
		} else {
			// a trailing comma: the text before a closer ends in one only outside a string, which ends in a quote
			if (c === '}' || c === ']') out = out.replace(/,(\s*)$/, '$1');
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

/** languages a scope names; null when it names none of ours, which is a file for other editors */
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
	if (!isObject(raw)) return { problem: 'is not an object' };
	if (raw.disabled === true) return { disabled: true };
	const scope = scopeOf(raw.scope);
	if (!scope) return typeof raw.scope === 'string' ? { skip: true } : { problem: 'scope is not a string' };

	const wrap = raw.wrap;
	if (wrap !== undefined && (typeof wrap !== 'string' || !FUNCTION_NAME.test(wrap))) return { problem: 'wrap is not a function name' };

	const bodies: Snippet['bodies'] = {};
	if (isObject(raw.body)) {
		for (const [lang, body] of Object.entries(raw.body)) {
			const id = LANGUAGE_IDS[lang.toLowerCase()];
			const text = textOf(body);
			if (!id) return { problem: `body names an unknown language "${lang}"` };
			if (text === null) return { problem: `body.${lang} is not text` };
			if (scope.includes(id)) bodies[id] = text;
		}
	} else if (raw.body !== undefined) {
		const text = textOf(raw.body);
		if (text === null) return { problem: 'body is not text' };
		for (const lang of scope) bodies[lang] = text;
	} else if (!wrap) return { problem: 'has no body' };

	const prefixes = typeof raw.prefix === 'string' ? [raw.prefix] : raw.prefix;
	if (prefixes !== undefined && (!Array.isArray(prefixes) || !prefixes.every((p) => typeof p === 'string' && p))) {
		return { problem: 'prefix is not text' };
	}
	const key = raw.key;
	let visual: Snippet['visual'];
	if (raw.visual !== undefined) {
		if (!wrap) return { problem: 'visual needs wrap' };
		const read = readCallLook(raw.visual);
		if (typeof read === 'string') return { problem: read };
		visual = read;
	}
	const wraps = !!wrap || Object.values(bodies).some(usesSelection);
	if (!prefixes?.length && !wraps && typeof key !== 'string') return { problem: 'has no prefix' };

	const context = raw.context ?? 'any';
	if (!CONTEXTS.includes(context as SnippetContext))
		return { problem: `context "${String(context)}" is not one of ${CONTEXTS.join(', ')}` };
	for (const flag of ['auto', 'word', 'regex'] as const) {
		if (raw[flag] !== undefined && typeof raw[flag] !== 'boolean') return { problem: `${flag} is not true or false` };
	}
	const flags = raw.flags ?? '';
	if (typeof flags !== 'string' || !/^[iu]*$/.test(flags)) return { problem: 'flags may only be i and u' };
	if (raw.priority !== undefined && typeof raw.priority !== 'number') return { problem: 'priority is not a number' };
	if (key !== undefined && typeof key !== 'string') return { problem: 'key is not text' };
	if (raw.args !== undefined && typeof raw.args !== 'string') return { problem: 'args is not text' };
	if (raw.description !== undefined && typeof raw.description !== 'string') return { problem: 'description is not text' };

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
		problems.push({ layer, name: 'variables', reason: 'is not an object' });
		return out;
	}
	for (const [name, value] of Object.entries(raw)) {
		if (typeof value === 'string') out[name] = Object.fromEntries(SNIPPET_LANGUAGES.map((l) => [l, value]));
		else if (isObject(value) && Object.values(value).every((v) => typeof v === 'string')) {
			out[name] = Object.fromEntries(
				Object.entries(value).flatMap(([lang, v]) => (LANGUAGE_IDS[lang.toLowerCase()] ? [[LANGUAGE_IDS[lang.toLowerCase()], v]] : []))
			);
		} else problems.push({ layer, name: `variables.${name}`, reason: 'is not text' });
	}
	return out;
}

export function parseSnippetFile(text: string, layer: SnippetLayer): SnippetFile {
	const file: SnippetFile = { snippets: [], disabled: [], variables: {}, problems: [] };
	let parsed: unknown;
	try {
		parsed = JSON.parse(stripJsonc(text));
	} catch (e) {
		file.problems.push({ layer, name: '', reason: `is not valid JSON: ${(e as Error).message}` });
		return file;
	}
	if (!isObject(parsed)) {
		file.problems.push({ layer, name: '', reason: 'is not a JSON object' });
		return file;
	}
	// a wrapper is told apart from a bare VS Code file by its snippets map
	const wrapped = isObject(parsed.snippets) && !('body' in parsed.snippets);
	if (wrapped && parsed.v !== undefined && parsed.v !== 1) {
		file.problems.push({ layer, name: '', reason: `is version ${String(parsed.v)}, which this Texpile cannot read` });
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
