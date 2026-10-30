import { escapeRegExp } from '../sourceText';

const LOADED = /\\usetikzlibrary\s*\{([^}]*)\}/g;

/** the text with `\usepackage{name}` before `\begin{document}` when it has a preamble that does not load it yet */
export function withPackage(source: string, name: string) {
	const body = source.indexOf('\\begin{document}');
	const used = new RegExp(`\\\\usepackage(\\[[^\\]]*\\])?\\{[^}]*\\b${escapeRegExp(name)}\\b`).test(source.slice(0, body));
	return body >= 0 && !used ? `${source.slice(0, body)}\\usepackage{${name}}\n${source.slice(body)}` : source;
}

/**
 * The text with `\usetikzlibrary{name}` in its preamble when it has one and does not load it yet; a picture alone is
 * drawn under its host's preamble, which is the host's to set. `shift` is how far the picture moved down
 */
export function withLibrary(source: string, name: string) {
	const body = source.indexOf('\\begin{document}');
	if (body < 0) return { source, shift: 0 };
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
