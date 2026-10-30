// what a class or package file does as it loads: its top-level calls outside any \if...\fi
import { latexTreeOf } from '$lib/languages/latex/syntax/latexTrees';
import { blankComments } from '$lib/languages/latex/texCode';

const DECLARES: Record<string, number> = { newif: 1, def: 1, gdef: 1, edef: 1, xdef: 1, let: 2 };

/** `text` with what an \if holds blanked, and `keep`, which says a call starts at its top level */
export function loadTimeOf(file: string): { text: string; keep: (at: number) => boolean } {
	const code = blankComments(file);
	const chars = code.split('');
	let depth = 0;
	// the names a \newif, \def or \let declares (\let\if@draft\iffalse) open no conditional
	let named = 0;
	for (let c = latexTreeOf(code).topNode.firstChild; c; c = c.nextSibling) {
		const word = c.name === 'ControlWord' ? code.slice(c.from + 1, c.to) : null;
		if (word && named > 0) named--;
		else if (word && DECLARES[word]) named = DECLARES[word];
		else if (word === 'fi') depth = Math.max(0, depth - 1);
		else if (word?.startsWith('if')) depth++;
		else if (depth > 0) for (let i = c.from; i < c.to; i++) if (chars[i] !== '\n') chars[i] = ' ';
		if (depth > 0 && word) for (let i = c.from; i < c.to; i++) chars[i] = ' ';
	}
	const text = chars.join('');
	const starts = new Set<number>();
	for (let c = latexTreeOf(text).topNode.firstChild; c; c = c.nextSibling) if (c.name === 'ControlWord') starts.add(c.from);
	return { text, keep: (at) => starts.has(at) };
}
