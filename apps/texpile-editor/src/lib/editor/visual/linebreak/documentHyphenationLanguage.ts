// which hyphenation patterns a document's own source asks for
import { codeOnly } from '$lib/languages/latex/texCode';
import type { HyphenationLanguage } from './hyphenationLanguages';

// babel and polyglossia names, Typst and Markdown language codes
const BY_NAME: Record<string, HyphenationLanguage> = {
	english: 'en-us',
	american: 'en-us',
	usenglish: 'en-us',
	en: 'en-us',
	british: 'en-gb',
	ukenglish: 'en-gb',
	'en-gb': 'en-gb',
	german: 'de-1996',
	ngerman: 'de-1996',
	austrian: 'de-1996',
	naustrian: 'de-1996',
	de: 'de-1996',
	french: 'fr',
	francais: 'fr',
	fr: 'fr',
	spanish: 'es',
	es: 'es',
	dutch: 'nl',
	nl: 'nl',
	polish: 'pl',
	pl: 'pl'
};

const BABEL = /\\usepackage\s*\[([^\]]*)\]\s*\{babel\}/;
const BARE_BABEL = /\\usepackage\s*\{babel\}/;
const CLASS_OPTIONS = /\\documentclass\s*\[([^\]]*)\]/;
const POLYGLOSSIA = /\\setmainlanguage\s*(?:\[[^\]]*\]\s*)?\{([^}]*)\}|\\setdefaultlanguage\s*(?:\[[^\]]*\]\s*)?\{([^}]*)\}/;
const TYPST = /#set\s+text\s*\([^)]*\blang\s*:\s*"([^"]+)"/;
const FRONTMATTER = /^---\r?\n[\s\S]*?^lang(?:uage)?\s*:\s*["']?([A-Za-z-]+)/m;

/** 'none' for a language without patterns here: English splits in Italian words would be wrong ones */
export type DocumentHyphenation = HyphenationLanguage | 'none';

/** undefined when the source names no language */
export function documentHyphenationLanguage(source: string): DocumentHyphenation | undefined {
	const code = codeOnly(source);
	const babel = BABEL.exec(code)?.[1];
	if (babel) {
		const options = babel.split(',').map((option) => option.trim());
		// babel's main language is the one marked main=, else the last one listed
		const main = options.find((option) => option.startsWith('main='))?.slice(5) ?? options.filter((option) => !option.includes('=')).pop();
		return main ? (BY_NAME[main.toLowerCase()] ?? 'none') : undefined;
	}
	// babel loaded bare takes its languages from the class options, which also hold the paper size and the like
	const classLanguage = BARE_BABEL.test(code)
		? CLASS_OPTIONS.exec(code)?.[1]
				.split(',')
				.map((option) => option.trim().toLowerCase())
				.filter((option) => Object.hasOwn(BY_NAME, option))
				.pop()
		: undefined;
	if (classLanguage) return BY_NAME[classLanguage];
	const polyglossia = POLYGLOSSIA.exec(code);
	const named = polyglossia?.[1] ?? polyglossia?.[2] ?? TYPST.exec(source)?.[1] ?? FRONTMATTER.exec(source)?.[1];
	return named ? (BY_NAME[named.trim().toLowerCase()] ?? 'none') : undefined;
}
