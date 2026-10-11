// the snippets in force: built-in, then the global file, then the project's, later replacing
// earlier by name. editors read it on each keystroke and re-read it when it changes
import { m } from '$lib/paraglide/messages';
import { usesSelection } from '../expand/bodyTemplate';
import type { CompiledSnippet } from '../expand/matchSnippets';
import { BUILTIN_SNIPPETS, BUILTIN_VARIABLES } from './builtinSnippets';
import { TYPST_MATH_NAMES } from './typstNames';
import {
	SNIPPET_LANGUAGES,
	type Snippet,
	type SnippetFile,
	type SnippetLanguage,
	type SnippetProblem,
	type SnippetVariables
} from './snippetTypes';

export type LanguageSnippets = {
	auto: CompiledSnippet[];
	popup: CompiledSnippet[];
	keyed: CompiledSnippet[];
	wraps: CompiledSnippet[];
};

export type SnippetRegistry = {
	languages: Record<SnippetLanguage, LanguageSnippets>;
	problems: SnippetProblem[];
	/** the project's regex triggers, while they wait to be allowed; the text they are allowed by */
	pendingPatterns: string | null;
};

export type SnippetLayers = {
	global: SnippetFile | null;
	project: SnippetFile | null;
	allowedPatterns: string | null;
	/** the package files' problems, shown with the snippet files' */
	packageProblems?: SnippetProblem[];
};

function mergeVariables(...sets: SnippetVariables[]): SnippetVariables {
	const out: SnippetVariables = {};
	for (const set of sets) for (const [name, byLang] of Object.entries(set)) out[name] = { ...out[name], ...byLang };
	return out;
}

const VARIABLE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

/** the prefix with each `${NAME}` the set defines for `lang` put in; `missing` is the first it does not */
function expandVariables(prefix: string, lang: SnippetLanguage, variables: SnippetVariables): { source: string; missing: string } {
	let missing = '';
	const source = prefix.replace(VARIABLE, (whole, name: string) => {
		const value = variables[name]?.[lang];
		if (value === undefined) missing ||= name;
		return value === undefined ? whole : `(?:${value})`;
	});
	return { source, missing };
}

function compilePatterns(s: Snippet, lang: SnippetLanguage, variables: SnippetVariables, problems: SnippetProblem[]): RegExp[] | null {
	const patterns: RegExp[] = [];
	for (const prefix of s.prefixes) {
		const { source, missing } = expandVariables(prefix, lang, variables);
		if (missing) {
			problems.push({ layer: s.layer, name: s.name, reason: `uses \${${missing}}, which no variables entry defines for ${lang}` });
			return null;
		}
		try {
			patterns.push(new RegExp(`(?:${source})$`, s.flags));
		} catch (e) {
			problems.push({ layer: s.layer, name: s.name, reason: `prefix is not a valid regular expression: ${(e as Error).message}` });
			return null;
		}
	}
	return patterns;
}

// what the project's file puts into this pattern: all of it when the snippet is the project's, else its variables
function projectPatternLines(s: Snippet, projectVariables: SnippetVariables): string[] {
	const lines: string[] = [];
	for (const lang of Object.keys(s.bodies) as SnippetLanguage[]) {
		for (const prefix of s.prefixes) {
			const { source } = expandVariables(prefix, lang, projectVariables);
			if (s.layer === 'project' || source !== prefix) lines.push(s.flags ? `(?${s.flags})${source}` : source);
		}
	}
	return lines;
}

export function compileSnippets(layers: SnippetLayers): SnippetRegistry {
	const problems: SnippetProblem[] = [...(layers.packageProblems ?? [])];
	const merged = new Map<string, Snippet>(BUILTIN_SNIPPETS.map((s) => [s.name, s]));
	let pendingPatterns: string | null = null;
	for (const file of [layers.global, layers.project]) {
		if (!file) continue;
		problems.push(...file.problems);
		for (const name of file.disabled) merged.delete(name);
		for (const s of file.snippets) merged.set(s.name, s);
	}
	for (const s of merged.values()) {
		if (!s.regex || s.auto || s.key || s.wrap || Object.values(s.bodies).some(usesSelection)) continue;
		problems.push({ layer: s.layer, name: s.name, reason: m.snippets_pattern_needs_auto() });
		merged.delete(s.name);
	}
	// a project's patterns run on every keystroke, so a cloned one waits until it is allowed here, and
	// so does any pattern the project's variables change
	const projectVariables = layers.project?.variables ?? {};
	const held = [...merged.values()]
		.filter((s) => s.regex && s.auto)
		.map((s) => ({ s, lines: projectPatternLines(s, projectVariables) }))
		.filter(({ lines }) => lines.length);
	if (held.length) {
		const key = [...new Set(held.flatMap(({ lines }) => lines))].sort().join('\n');
		if (key !== layers.allowedPatterns) {
			pendingPatterns = key;
			for (const { s } of held) merged.delete(s.name);
		}
	}
	const variables = mergeVariables(BUILTIN_VARIABLES, layers.global?.variables ?? {}, projectVariables);

	const languages = Object.fromEntries(
		SNIPPET_LANGUAGES.map((lang) => [lang, { auto: [], popup: [], keyed: [], wraps: [] } as LanguageSnippets])
	) as Record<SnippetLanguage, LanguageSnippets>;
	for (const s of merged.values()) {
		for (const [lang, body] of Object.entries(s.bodies) as [SnippetLanguage, string][]) {
			const pattern = s.regex && s.auto;
			const patterns = pattern ? compilePatterns(s, lang, variables, problems) : null;
			if (pattern && !patterns) continue;
			const compiled: CompiledSnippet = { snippet: s, lang, body, patterns, word: s.word ?? (lang === 'typst' && s.auto) };
			const bucket = languages[lang];
			if (s.prefixes.length && s.auto) bucket.auto.push(compiled);
			else if (s.prefixes.length && !s.regex) bucket.popup.push(compiled);
			if (s.key) bucket.keyed.push(compiled);
			if (s.wrap || usesSelection(body)) bucket.wraps.push(compiled);
			if (lang === 'typst' && s.auto && !s.regex && s.context !== 'text' && s.context !== 'code') {
				const clash = s.prefixes.find((p) => TYPST_MATH_NAMES.has(p));
				if (clash)
					problems.push({
						layer: s.layer,
						name: s.name,
						reason: `"${clash}" is already a Typst name, so typing it in an equation expands it`
					});
			}
		}
	}
	const seen = new Set<string>();
	const unique = problems.filter((p) => {
		const key = `${p.layer}\n${p.name}\n${p.reason}`;
		return !seen.has(key) && !!seen.add(key);
	});
	return { languages, problems: unique, pendingPatterns };
}

let layers: SnippetLayers = { global: null, project: null, allowedPatterns: null };
let current = compileSnippets(layers);
const listeners = new Set<() => void>();

export function snippetRegistry(): SnippetRegistry {
	return current;
}

export function onSnippetRegistry(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function setSnippetLayers(next: Partial<SnippetLayers>): void {
	layers = { ...layers, ...next };
	current = compileSnippets(layers);
	for (const listener of listeners) listener();
}
