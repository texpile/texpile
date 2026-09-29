// uses of a label or cite key in other files, matched as the name alone so a rename rewrites nothing else
import type { ReplaceSpec } from '$lib/search/replaceInFiles';

export type UseKind = 'label' | 'cite';
export type UseLanguage = 'latex' | 'typst';

export function useLanguageOf(path: string): UseLanguage | null {
	const ext = /\.([^./\\]+)$/.exec(path)?.[1]?.toLowerCase();
	if (ext === 'tex' || ext === 'ltx' || ext === 'sty' || ext === 'cls') return 'latex';
	if (ext === 'typ') return 'typst';
	return null;
}

/** regex source */
export function usePattern(kind: UseKind, name: string, lang: UseLanguage): string {
	const n = escapeRe(name);
	// typst: @name or <name>, labels and keys alike; a full stop after @name ends the sentence
	if (lang === 'typst') return `(?<=(?<![\\w@])@)${n}(?![\\w:-]|\\.\\w)|(?<=<)${n}(?=>)`;
	// the name alone in its list: a brace, a comma or a space on either side
	const alone = `(?<![^{,\\s])${n}(?![^},\\s])`;
	if (kind === 'label') return `(?<=\\\\[A-Za-z]*ref\\*?\\{[^{}]*?)${alone}|(?<=\\\\hyperref\\[\\s*)${n}(?=\\s*\\])`;
	// \Cite, \Citet and the like too, and every key group of a multicite (\cites{a}{b})
	return `(?<=\\\\[A-Za-z]*[Cc]ite[A-Za-z]*\\*?(?:\\s*\\[[^\\]]*\\]|\\s*\\{[^{}]*\\})*\\s*\\{[^{}]*?)${alone}`;
}

export function renameSpec(kind: UseKind, from: string, to: string, lang: UseLanguage): ReplaceSpec {
	// a regex replacement reads $ as a group reference; the new name is literal
	return { query: usePattern(kind, from, lang), replacement: to.replace(/\$/g, '$$$$'), regex: true, caseSensitive: true };
}

function escapeRe(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
