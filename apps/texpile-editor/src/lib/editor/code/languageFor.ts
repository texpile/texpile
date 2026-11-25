// the grammar a raw island or code block is read with: the app's LaTeX at once, Typst's wasm and language-data on demand
import type { Language } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { latexLanguage } from '$lib/languages/latex/source/latexLanguage';
import { isCodeChip } from '$lib/languages/typst/syntax/codeChip';

/** 'latex', 'typst', 'typst-code' or a language-data name */
export type CodeLanguageName = string;

const RAW_LANGUAGES: Record<string, CodeLanguageName> = { html: 'HTML', markdown: 'Markdown' };
const loaded = new Map<CodeLanguageName, Language | null>([['latex', latexLanguage]]);
const loading = new Map<CodeLanguageName, Promise<Language | null>>();

/** a raw node's `lang` attr; Typst source that is code without its hash reads with the code grammar */
export function rawLanguageName(lang: unknown, text: string): CodeLanguageName {
	if (lang === 'typst') return isCodeChip(text) ? 'typst-code' : 'typst';
	return RAW_LANGUAGES[String(lang)] ?? 'latex';
}

/** a code block's `lang` read as its CodeMirror read it: a language-data name, else Markdown */
export function codeBlockLanguageName(lang: unknown): CodeLanguageName {
	const name = String(lang ?? '');
	if (/^(latex|tex|stex)$/i.test(name)) return 'latex';
	return languages.find((each) => each.name.toLowerCase() === name.toLowerCase())?.name ?? 'Markdown';
}

async function fetchLanguage(name: CodeLanguageName): Promise<Language | null> {
	if (name === 'typst' || name === 'typst-code') {
		const { typstIslandLanguage } = await import('$lib/languages/typst/source/typstLanguage');
		return typstIslandLanguage(name === 'typst' ? '' : 'code').language;
	}
	const described = languages.find((each) => each.name.toLowerCase() === name.toLowerCase());
	return described ? (await described.load()).language : null;
}

/** the grammar when it is here; null while it loads, and for a name no grammar answers */
export function languageNow(name: CodeLanguageName): Language | null {
	return loaded.get(name) ?? null;
}

export function languageLoaded(name: CodeLanguageName): boolean {
	return loaded.has(name);
}

/** loads once; a failed load answers null for the rest of the session */
export function loadLanguage(name: CodeLanguageName): Promise<Language | null> {
	if (loaded.has(name)) return Promise.resolve(loaded.get(name)!);
	let pending = loading.get(name);
	if (!pending) {
		pending = fetchLanguage(name)
			.catch(() => null)
			.then((language) => {
				loaded.set(name, language);
				loading.delete(name);
				return language;
			});
		loading.set(name, pending);
	}
	return pending;
}
