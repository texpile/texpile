import { escapeRegExp } from '../sourceText';

const LOADED = /\\usetikzlibrary\s*\{([^}]*)\}/g;

/** a fragment's needs, which its host's preamble takes: noted by the text an edit made, so a preview's go nowhere */
export type FragmentNeeds = { packages: string[]; libraries: string[] };
const fragmentNeeds = new Map<string, FragmentNeeds>();
// previews note needs too; past this many texts the oldest are dropped
const NOTED_TEXTS = 32;

function noteNeed(source: string, kind: keyof FragmentNeeds, name: string): void {
	const needs = fragmentNeeds.get(source) ?? { packages: [], libraries: [] };
	if (!needs[kind].includes(name)) needs[kind].push(name);
	fragmentNeeds.delete(source);
	fragmentNeeds.set(source, needs);
	if (fragmentNeeds.size > NOTED_TEXTS) fragmentNeeds.delete(fragmentNeeds.keys().next().value!);
}

/** what the edit that made `source` needs from the host's preamble, once */
export function takeFragmentNeeds(source: string): FragmentNeeds | null {
	const needs = fragmentNeeds.get(source) ?? null;
	fragmentNeeds.clear();
	return needs;
}

/** the text with `\usepackage{name}` before `\begin{document}` when it has a preamble that does not load it yet */
export function withPackage(source: string, name: string) {
	const body = source.indexOf('\\begin{document}');
	if (body < 0) noteNeed(source, 'packages', name);
	const used = new RegExp(`\\\\usepackage(\\[[^\\]]*\\])?\\{[^}]*\\b${escapeRegExp(name)}\\b`).test(source.slice(0, body));
	return body >= 0 && !used ? `${source.slice(0, body)}\\usepackage{${name}}\n${source.slice(body)}` : source;
}

/**
 * The text with `\usetikzlibrary{name}` in its preamble when it has one and does not load it yet; a picture alone is
 * drawn under its host's preamble, which is the host's to set. `shift` is how far the picture moved down
 */
export function withLibrary(source: string, name: string) {
	const body = source.indexOf('\\begin{document}');
	if (body < 0) {
		noteNeed(source, 'libraries', name);
		return { source, shift: 0 };
	}
	const loaded = [...source.slice(0, body).matchAll(LOADED)];
	if (loaded.some((m) => m[1].split(',').some((l) => l.trim() === name))) return { source, shift: 0 };
	const last = loaded.at(-1);
	if (last) {
		const at = last.index! + last[0].length - 1;
		const text = last[1].trim() ? `,${name}` : name;
		return { source: source.slice(0, at) + text + source.slice(at), shift: text.length };
	}
	const tikz = /\\usepackage(\[[^\]]*\])?\{[^}]*\btikz\b[^}]*\}[^\n]*\n/.exec(source.slice(0, body));
	const at = tikz ? tikz.index + tikz[0].length : body;
	const text = `\\usetikzlibrary{${name}}\n`;
	return { source: source.slice(0, at) + text + source.slice(at), shift: text.length };
}
