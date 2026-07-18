// glossary/acronym completion for \gls/\glspl/\acs/\acl/\acf/etc, sourced from
// \newglossaryentry/\newacronym definitions in the buffer, other project files (projectIntel),
// and bib2gls-style .bib entries already loaded into referenceStore.
import { get } from 'svelte/store';
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { referenceStore } from '$lib/stores/editorStore';
import { projectIntelStore } from '$lib/stores/projectIntel';
import { lastListToken } from './shared';

export interface GlossEntry {
	key: string;
	description: string;
	acronym: boolean;
	/** 1-based definition line, for the cross-file project scan and go-to-definition */
	line: number;
}

// the glossaries package's macro family: \gls, \glspl, \glstext, \glsdisp, \Glsname, \acs, \acl,
// \acf, \acp, \Acrlong, ... (case-insensitive, matching LaTeX Workshop's own enumeration)
const GLOSS_TRIGGER =
	/\\(gls(?:str)?(?:pl|text|first|fmt(?:text|short|long)|plural|firstplural|name|symbol|desc|disp|user(?:i|ii|iii|iv|v|vi))?|Acr(?:long|full|short)?(?:pl)?|ac[slf]?p?)(?:\[[^\]]*\])?\{[^{}]*$/i;

const MAX_SCAN_LENGTH = 2_000_000;
let cache: { text: string; entries: GlossEntry[] } | null = null;

function balancedArg(text: string, openBrace: number): { content: string; end: number } | null {
	if (text[openBrace] !== '{') return null;
	let depth = 0;
	for (let i = openBrace; i < text.length; i++) {
		if (text[i] === '{') depth++;
		else if (text[i] === '}') {
			depth--;
			if (depth === 0) return { content: text.slice(openBrace + 1, i), end: i + 1 };
		}
	}
	return null;
}

/** \newglossaryentry/\newacronym definitions in `text`; also feeds the cross-file project scan. */
export function scanGlossary(text: string): GlossEntry[] {
	if (text.length > MAX_SCAN_LENGTH) return [];
	const entries: GlossEntry[] = [];
	const lineOf = (i: number) => text.slice(0, i).split('\n').length;

	const glossRe = /\\(?:long)?(?:new|provide)glossaryentry\{([^{}]+)\}\s*\{/g;
	let m: RegExpExecArray | null;
	while ((m = glossRe.exec(text))) {
		const body = balancedArg(text, m.index + m[0].length - 1);
		if (!body) continue;
		const desc = /description\s*=\s*(\{([^{}]*)\}|[^,}]+)/.exec(body.content);
		entries.push({ key: m[1].trim(), description: (desc?.[2] ?? desc?.[1] ?? '').trim(), acronym: false, line: lineOf(m.index) });
	}

	const acroRe = /\\new(?:acronym|abbreviation|abbr)(?:\[[^\]]*\])?\{([^{}]+)\}\{([^{}]*)\}\{([^{}]*)\}/g;
	while ((m = acroRe.exec(text))) entries.push({ key: m[1].trim(), description: m[3].trim(), acronym: true, line: lineOf(m.index) });

	return entries;
}

// glossaries-extra bib2gls entry types whose keys are \gls-able
const GLOSSARY_BIB_TYPES = new Set(['entry', 'acronym', 'abbreviation', 'symbol', 'index', 'dualentry', 'dualacronym']);

export function glossaryCompletionSource(ctx: CompletionContext): CompletionResult | null {
	const match = ctx.matchBefore(GLOSS_TRIGGER);
	if (!match) return null;
	const text = ctx.state.doc.toString();
	if (!cache || cache.text !== text) cache = { text, entries: scanGlossary(text) };

	// buffer first, then definitions in other project files, then bib2gls .bib entries
	const merged = new Map<string, { description: string; acronym: boolean }>();
	for (const e of cache.entries) merged.set(e.key, e);
	for (const e of get(projectIntelStore).glossary) if (!merged.has(e.key)) merged.set(e.key, e);
	for (const r of get(referenceStore) ?? []) {
		if (!GLOSSARY_BIB_TYPES.has(r.entrytype) || merged.has(r.key)) continue;
		const description = typeof r.description === 'string' ? r.description : typeof r.short === 'string' ? r.short : '';
		merged.set(r.key, { description, acronym: r.entrytype.includes('acronym') || r.entrytype.includes('abbreviation') });
	}
	if (!merged.size) return null;

	// macros starting with "ac" (case-insensitive) are acronym-specific; \gls itself can point at either
	const macroName = /\\([a-zA-Z]+)/.exec(match.text)?.[1] ?? '';
	const acronymOnly = /^ac/i.test(macroName);
	const pool = [...merged.entries()].filter(([, e]) => !acronymOnly || e.acronym);
	if (!pool.length) return null;

	const options: Completion[] = pool.map(([key, e]) => ({ label: key, detail: e.description || undefined, type: 'variable' }));
	return lastListToken(match, options);
}
