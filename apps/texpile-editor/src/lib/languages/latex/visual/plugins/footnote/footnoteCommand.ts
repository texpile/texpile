// a footnote as its settings, the note's text and the number it gives itself (\footnote[7]{...}), if any
import { balancedBraces } from '$lib/languages/latex/visual/core';
export type FootnoteCommand = {
	/** '' when LaTeX counts it */
	number: string;
	note: string;
};

const FOOTNOTE = /^(\s*\\footnote(?:text)?)(\s*\[([^\]{}]*)\])?(\s*\{)([\s\S]*)(\}\s*)$/;

export function readFootnote(source: string): FootnoteCommand | null {
	const match = FOOTNOTE.exec(source);
	return match && balancedBraces(match[5]) ? { number: match[3]?.trim() ?? '', note: match[5] } : null;
}

/** an unchanged number keeps its bracket as written */
export function writeFootnote(source: string, next: FootnoteCommand): string {
	return source.replace(
		FOOTNOTE,
		(_, head: string, bracket = '', given = '', open: string, _note: string, close: string) =>
			head + (given.trim() === next.number ? bracket : next.number ? `[${next.number}]` : '') + open + next.note + close
	);
}
