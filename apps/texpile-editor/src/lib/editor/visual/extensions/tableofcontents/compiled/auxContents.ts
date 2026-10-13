// the Contents a LaTeX compile recorded: every heading, figure and table writes a \contentsline to the .aux, numbered
// as the class printed it, whether or not the paper has a \tableofcontents. An \include'd file writes its own .aux
import { groupsFrom } from '$lib/workspace/auxLabels';
import type { CompiledEntry } from './compiledNumbers';

// a \contentsline only: a chapter also writes \addvspace into the lists of figures and tables
const LINE = /\\@writefile\{(toc|lof|lot)\}\{(?=\\contentsline\b)|\\@input\{([^{}]+)\}/g;
const KIND = { toc: 'heading', lof: 'figure', lot: 'table' } as const;
// \numberline in the kernel and KOMA, \chapternumberline and \partnumberline in memoir
const NUMBERLINE = /^\s*\\[a-zA-Z]*numberline\s*\{/;
// \part in the standard classes: `I\hspace {1em}Title`
const PART = /^\s*([^\s\\{}]+)\\hspace\s*\{1em\}/;

export type AuxContentsPart = CompiledEntry | { include: string };

/** `{\numberline {1.2}Title}` into its number and title; a heading the class left unnumbered has no \numberline */
function numberAndTitle(text: string): { number: string | null; title: string } {
	const part = PART.exec(text);
	if (part) return { number: part[1], title: text.slice(part[0].length).trim() };
	const at = NUMBERLINE.exec(text);
	if (!at) return { number: null, title: text.trim() };
	let depth = 1;
	let i = at[0].length;
	for (; i < text.length && depth > 0; i++) {
		if (text[i] === '\\') i++;
		else if (text[i] === '{') depth++;
		else if (text[i] === '}') depth--;
	}
	return { number: text.slice(at[0].length, i - 1).trim(), title: text.slice(i).trim() };
}

/** the entries in this .aux in order, with the .aux files it reads in (\include) where it reads them */
export function parseAuxContents(aux: string): AuxContentsPart[] {
	const out: AuxContentsPart[] = [];
	LINE.lastIndex = 0;
	for (let m = LINE.exec(aux); m; m = LINE.exec(aux)) {
		if (m[2]) {
			out.push({ include: m[2].trim() });
			continue;
		}
		const [, text = ''] = groupsFrom(aux, m.index + m[0].length);
		out.push({ kind: KIND[m[1] as keyof typeof KIND], ...numberAndTitle(text) });
	}
	return out;
}
