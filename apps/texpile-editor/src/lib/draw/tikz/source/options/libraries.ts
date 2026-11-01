import { documentWrapperOf } from '$lib/languages/latex/syntax/documentWrapper';
import { codeOnly } from '$lib/languages/latex/texCode';
import { escapeRegExp } from '../sourceText';

const LOADED = /\\usetikzlibrary\s*\{([^}]*)\}/g;

/** a fragment's needs, which its host's preamble takes: noted by the text an edit made, so a preview's go nowhere */
export type FragmentNeeds = { packages: string[]; libraries: string[] };
const fragmentNeeds = new Map<string, FragmentNeeds>();
const NOTED_TEXTS = 32;

function noteNeed(source: string, kind: keyof FragmentNeeds, name: string): void {
	const needs = fragmentNeeds.get(source) ?? { packages: [], libraries: [] };
	if (!needs[kind].includes(name)) needs[kind].push(name);
	fragmentNeeds.delete(source);
	fragmentNeeds.set(source, needs);
	if (fragmentNeeds.size > NOTED_TEXTS) fragmentNeeds.delete(fragmentNeeds.keys().next().value!);
}

export function takeFragmentNeeds(source: string): FragmentNeeds | null {
	const needs = fragmentNeeds.get(source) ?? null;
	fragmentNeeds.clear();
	return needs;
}

export function withPackage(source: string, name: string) {
	const body = documentWrapperOf(source)?.begin.from ?? -1;
	if (body < 0) {
		noteNeed(source, 'packages', name);
		return source;
	}
	const used = new RegExp(`\\\\usepackage(\\[[^\\]]*\\])?\\{[^}]*\\b${escapeRegExp(name)}\\b`).test(codeOnly(source).slice(0, body));
	return used ? source : `${source.slice(0, body)}\\usepackage{${name}}\n${source.slice(body)}`;
}

/** the text with \usetikzlibrary{name} in its preamble if it has one; a lone picture is drawn under its host's */
export function withLibrary(source: string, name: string) {
	const body = documentWrapperOf(source)?.begin.from ?? -1;
	if (body < 0) {
		noteNeed(source, 'libraries', name);
		return { source, shift: 0 };
	}
	const preamble = codeOnly(source).slice(0, body);
	const loaded = [...preamble.matchAll(LOADED)];
	if (loaded.some((m) => m[1].split(',').some((l) => l.trim() === name))) return { source, shift: 0 };
	const last = loaded.at(-1);
	if (last) {
		const at = last.index! + last[0].length - 1 - (last[1].length - last[1].trimEnd().length);
		const text = last[1].trim() ? `,${name}` : name;
		return { source: source.slice(0, at) + text + source.slice(at), shift: text.length };
	}
	const tikz = /\\usepackage(\[[^\]]*\])?\{[^}]*\btikz\b[^}]*\}[^\n]*\n/.exec(preamble);
	const at = tikz ? tikz.index + tikz[0].length : body;
	const text = `\\usetikzlibrary{${name}}\n`;
	return { source: source.slice(0, at) + text + source.slice(at), shift: text.length };
}
