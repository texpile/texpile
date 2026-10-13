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
import { m } from '$lib/paraglide/messages';

const CONTEXTS: readonly SnippetContext[] = ['math', 'inline-math', 'display-math', 'text', 'code', 'any'];
const LANGUAGE_IDS: Record<string, SnippetLanguage> = {
	latex: 'latex',
	tex: 'latex',
	typst: 'typst',
	markdown: 'markdown',
	md: 'markdown'
};

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
	if (!isObject(raw))
		return { problem: m.snippets_entry_not_object({ braces: '{ }', example: '"Name": { "prefix": "ff", "body": "text" }' }) };
	if (raw.disabled === true) return { disabled: true };
	const scope = scopeOf(raw.scope);
	if (!scope) return typeof raw.scope === 'string' ? { skip: true } : { problem: m.snippets_scope_not_text() };

	const bodies: Snippet['bodies'] = {};
	if (isObject(raw.body)) {
		for (const [lang, body] of Object.entries(raw.body)) {
			const id = LANGUAGE_IDS[lang.toLowerCase()];
			const text = textOf(body);
			if (!id) return { problem: m.snippets_body_unknown_language({ language: lang }) };
			if (text === null) return { problem: m.snippets_body_language_not_text({ language: lang }) };
			if (scope.includes(id)) bodies[id] = text;
		}
	} else if (raw.body !== undefined) {
		const text = textOf(raw.body);
		if (text === null) return { problem: m.snippets_body_not_text() };
		for (const lang of scope) bodies[lang] = text;
	} else return { problem: m.snippets_no_body() };

	const prefixes = typeof raw.prefix === 'string' ? [raw.prefix] : raw.prefix;
	if (prefixes !== undefined && (!Array.isArray(prefixes) || !prefixes.every((p) => typeof p === 'string' && p))) {
		return { problem: m.snippets_prefix_not_text() };
	}
	const key = raw.key;
	if (!prefixes?.length && typeof key !== 'string') return { problem: m.snippets_no_prefix() };

	const context = raw.context ?? 'any';
	if (!CONTEXTS.includes(context as SnippetContext))
		return { problem: m.snippets_context_unknown({ values: CONTEXTS.map((c) => `"${c}"`).join(', ') }) };
	for (const flag of ['auto', 'word', 'regex'] as const) {
		if (raw[flag] !== undefined && typeof raw[flag] !== 'boolean') return { problem: m.snippets_not_boolean({ field: flag }) };
	}
	const flags = raw.flags ?? '';
	if (typeof flags !== 'string' || !/^[iu]*$/.test(flags)) return { problem: m.snippets_flags_unknown() };
	if (raw.priority !== undefined && typeof raw.priority !== 'number') return { problem: m.snippets_priority_not_number() };
	if (key !== undefined && typeof key !== 'string') return { problem: m.snippets_key_not_text() };
	if (raw.description !== undefined && typeof raw.description !== 'string') return { problem: m.snippets_description_not_text() };
	// markdown math is latex, as the built-in @ snippets have it
	if ((context as SnippetContext).includes('math') && bodies.latex !== undefined && scope.includes('markdown'))
		bodies.markdown ??= bodies.latex;

	if (!Object.keys(bodies).length) return { skip: true };

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
			key: key as string | undefined
		}
	};
}

function readVariables(raw: unknown, layer: SnippetLayer, problems: SnippetProblem[]): SnippetVariables {
	const out: SnippetVariables = {};
	if (raw === undefined) return out;
	if (!isObject(raw)) {
		problems.push({ layer, name: 'variables', reason: m.snippets_variables_not_object({ braces: '{ }' }) });
		return out;
	}
	for (const [name, value] of Object.entries(raw)) {
		if (typeof value === 'string') out[name] = Object.fromEntries(SNIPPET_LANGUAGES.map((l) => [l, value]));
		else if (isObject(value) && Object.values(value).every((v) => typeof v === 'string')) {
			out[name] = Object.fromEntries(
				Object.entries(value).flatMap(([lang, v]) => (LANGUAGE_IDS[lang.toLowerCase()] ? [[LANGUAGE_IDS[lang.toLowerCase()], v]] : []))
			);
		} else problems.push({ layer, name: `variables.${name}`, reason: m.snippets_variable_not_text() });
	}
	return out;
}

export function notObject(): string {
	return m.snippets_not_object({ open: '{', close: '}' });
}

/** why `text` is not JSON, and where */
export function notJson(text: string, error: unknown): string {
	return m.snippets_not_json({ where: jsonErrorAt(text, (error as Error).message) });
}

/** a JSON.parse message with its character offset as a line and column of `text` */
export function jsonErrorAt(text: string, message: string): string {
	const at = /\s*in JSON at position (\d+)(?: \(line \d+ column \d+\))?/.exec(message);
	if (!at) return message;
	const before = text.slice(0, Number(at[1]));
	const line = before.split('\n').length;
	const column = before.length - before.lastIndexOf('\n');
	return `${m.snippets_json_where({ line, column })} (${message.slice(0, at.index)}${message.slice(at.index + at[0].length)})`;
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
		file.problems.push({ layer, name: '', reason: notObject(), whole: true });
		return file;
	}
	const wrapped = isObject(parsed.snippets) && !('body' in parsed.snippets);
	if (wrapped && parsed.v !== undefined && parsed.v !== 1) {
		file.problems.push({
			layer,
			name: '',
			reason: m.snippets_version_unsupported({ version: String(parsed.v) }),
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
