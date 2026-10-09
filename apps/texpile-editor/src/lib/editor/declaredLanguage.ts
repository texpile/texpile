// the language a document's own source names: babel, polyglossia, Typst's text lang, Markdown front matter
import { codeOnly } from '$lib/languages/latex/texCode';

export type DeclaredLanguage = {
	/** lowercase: a babel or polyglossia name (ngerman) or a language code (de, pt-br) */
	name: string;
	/** polyglossia's variant= or Typst's region, lowercase */
	variant?: string;
	/** the source that names it, as written */
	from: string;
};

// the babel names a class option can carry; anything else there is a paper size or a font size
const BABEL_NAMES = new Set(
	(
		'english american usenglish british ukenglish canadian australian newzealand german ngerman austrian naustrian ' +
		'swissgerman nswissgerman french francais frenchb acadian canadien spanish spanishmx italian dutch portuguese ' +
		'portuges portugues brazilian brazil polish russian ukrainian czech slovak swedish danish norsk nynorsk finnish ' +
		'greek turkish hungarian romanian catalan croatian serbian slovene estonian latvian lithuanian icelandic irish ' +
		'welsh latin hebrew arabic'
	).split(' ')
);

const BABEL = /\\usepackage\s*\[([^\]]*)\]\s*\{babel\}/;
const BARE_BABEL = /\\usepackage\s*\{babel\}/;
const CLASS_OPTIONS = /\\documentclass\s*\[([^\]]*)\]/;
const POLYGLOSSIA = /\\set(?:main|default)language\s*(?:\[([^\]]*)\]\s*)?\{([^}]*)\}/;
const TYPST = /#set\s+text\s*\(([^)]*)\)/;
const FRONTMATTER = /^---\r?\n[\s\S]*?^lang(?:uage)?\s*:\s*["']?([A-Za-z-]+)/m;
/** where a declaration can be: a LaTeX preamble, or the top of anything else */
const HEAD = 20_000;

function optionsOf(list: string): string[] {
	return list.split(',').map((option) => option.trim());
}

/** undefined when the source names no language */
export function declaredLanguage(source: string): DeclaredLanguage | undefined {
	const begin = source.indexOf('\\begin{document}');
	const head = source.slice(0, begin >= 0 ? begin : HEAD);
	const code = codeOnly(head);
	const babel = BABEL.exec(code);
	if (babel) {
		const options = optionsOf(babel[1]);
		// babel's main language is the one marked main=, else the last one listed
		const main = options.find((option) => option.startsWith('main='))?.slice(5) ?? options.filter((option) => !option.includes('=')).pop();
		return main ? { name: main.toLowerCase(), from: babel[0] } : undefined;
	}
	// babel loaded bare takes its languages from the class options, which also hold the paper size and the like
	const classOptions = BARE_BABEL.test(code) ? CLASS_OPTIONS.exec(code) : null;
	const classLanguage = classOptions
		? optionsOf(classOptions[1])
				.map((option) => option.toLowerCase())
				.filter((option) => BABEL_NAMES.has(option))
				.pop()
		: undefined;
	if (classOptions && classLanguage) return { name: classLanguage, from: classOptions[0] };
	const polyglossia = POLYGLOSSIA.exec(code);
	if (polyglossia) {
		const variant = polyglossia[1] && /variant\s*=\s*([\w-]+)/.exec(polyglossia[1])?.[1];
		return { name: polyglossia[2].trim().toLowerCase(), ...(variant ? { variant: variant.toLowerCase() } : {}), from: polyglossia[0] };
	}
	const typst = TYPST.exec(head);
	const lang = typst && /\blang\s*:\s*"([^"]+)"/.exec(typst[1]);
	if (typst && lang) {
		const region = /\bregion\s*:\s*"([^"]+)"/.exec(typst[1])?.[1];
		return { name: lang[1].toLowerCase(), ...(region ? { variant: region.toLowerCase() } : {}), from: typst[0] };
	}
	const front = FRONTMATTER.exec(head);
	return front ? { name: front[1].toLowerCase(), from: front[0].slice(front[0].lastIndexOf('\n') + 1) } : undefined;
}
