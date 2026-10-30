// the language a document's own source names: babel, polyglossia, Typst's text lang, Markdown front matter
import { codeOnly } from '$lib/languages/latex/texCode';
import { documentWrapperOf } from '$lib/languages/latex/syntax/documentWrapper';
import { callsIn, rolesOf, type CommandCall } from '$lib/languages/latex/knowledge/calls/commandCalls';
import { languageDeclarationsIn } from '$lib/languages/latex/knowledge/calls/languageDeclarations';
import { isBabelLanguageName, isBabelPackage, languageTagsOf } from '$lib/languages/latex/knowledge/registries/languageTags';
import { typstTreeNow } from '$lib/languages/typst/syntax/typstTrees';
import { namedArg, stringsOf } from '$lib/languages/typst/syntax/typstCalls';
import { setRulesOf, writtenRule } from '$lib/languages/typst/syntax/typstSetRules';

export type DeclaredLanguage = {
	/** lowercase: a babel or polyglossia name (ngerman) or a language code (de, pt-br) */
	name: string;
	/** polyglossia's variant= or Typst's region, lowercase */
	variant?: string;
	/** the source that names it, as written */
	from: string;
};

const FRONTMATTER = /^---\r?\n[\s\S]*?^lang(?:uage)?\s*:\s*["']?([A-Za-z-]+)/m;
/** where a declaration can be: a LaTeX preamble, or the top of anything else */
const HEAD = 20_000;

function listOf(list: string): string[] {
	return list.split(',').map((option) => option.trim());
}

function optionsOf(call: CommandCall): string | undefined {
	return call.args.find((a) => rolesOf(a.arg).includes('options'))?.values[0]?.value;
}

function typstTextLanguage(head: string): DeclaredLanguage | undefined {
	const tree = head.includes('#set') ? typstTreeNow(head) : null;
	if (!tree) return undefined;
	for (const rule of setRulesOf(tree, head, 'text')) {
		const [lang] = stringsOf(namedArg(rule, head, 'lang'), head);
		if (!lang) continue;
		const [region] = stringsOf(namedArg(rule, head, 'region'), head);
		return { name: lang.toLowerCase(), ...(region ? { variant: region.toLowerCase() } : {}), from: writtenRule(rule, head) };
	}
	return undefined;
}

/** undefined when the source names no language */
export function declaredLanguage(source: string): DeclaredLanguage | undefined {
	const head = source.slice(0, documentWrapperOf(source)?.begin.from ?? HEAD);
	const code = codeOnly(head);
	const babel = callsIn(code, ['package']).find((call) =>
		call.args.some((a) => rolesOf(a.arg).includes('package') && a.values.some((v) => isBabelPackage(v.value)))
	);
	const babelOptions = babel && optionsOf(babel);
	if (babel && babelOptions !== undefined) {
		const options = listOf(babelOptions);
		// babel's main language is the one marked main=, else the last one listed
		const main = options.find((option) => option.startsWith('main='))?.slice(5) ?? options.filter((option) => !option.includes('=')).pop();
		return main ? { name: main.toLowerCase(), from: code.slice(babel.at, babel.end) } : undefined;
	}
	// babel loaded bare takes its languages from the class options, which also hold the paper size and the like
	const documentClass = babel ? callsIn(code, ['class'])[0] : undefined;
	const classOptions = documentClass && optionsOf(documentClass);
	const classLanguage = classOptions
		? listOf(classOptions)
				.map((option) => option.toLowerCase())
				.filter(isBabelLanguageName)
				.pop()
		: undefined;
	if (documentClass && classLanguage) return { name: classLanguage, from: code.slice(documentClass.at, documentClass.end) };
	const declared = languageDeclarationsIn(code).find((d) => d.main);
	if (declared) {
		const variant = declared.options && /variant\s*=\s*([\w-]+)/.exec(declared.options)?.[1];
		return { name: declared.name.toLowerCase(), ...(variant ? { variant: variant.toLowerCase() } : {}), from: declared.from };
	}
	const typst = typstTextLanguage(head);
	if (typst) return typst;
	const front = FRONTMATTER.exec(head);
	return front ? { name: front[1].toLowerCase(), from: front[0].slice(front[0].lastIndexOf('\n') + 1) } : undefined;
}

function tagOfCode(named: DeclaredLanguage): string {
	const [language, ...rest] = named.name.split(/[-_]/);
	const subtags = rest.map((part) =>
		part.length === 2 ? part.toUpperCase() : part.length === 4 ? part[0].toUpperCase() + part.slice(1) : part
	);
	const region =
		named.variant && /^[a-z]{2}$/.test(named.variant) && !subtags.some((part) => part.length === 2) ? [named.variant.toUpperCase()] : [];
	return [language, ...subtags, ...region].join('-');
}

/** the BCP 47 tags a declaration stands for, best first: the registry's for a babel or polyglossia name, else the code as written */
export function declaredLanguageTags(named: DeclaredLanguage): string[] {
	const listed = languageTagsOf(named.name, named.variant).filter((tag) => tag !== named.name);
	// a code (Typst's lang, polyglossia's gloss-pt) reads with its region
	return listed.length ? listed : [tagOfCode(named)];
}
