// what Harper reads of a source file: markup blanked, offsets one to one with the source
import type { SpellLanguage } from '../languages/spellLanguages';
import { maskMarkdown } from '../languages/markdownMask';
import { maskTex, type TexMask } from '../texMask';
import { typstProse } from '$lib/workspace/wordCount/proseWords';

/** 'plaintext' for LaTeX, which Harper has no parser for: texMask strips the markup first */
export type SpellMarkup = 'plaintext' | 'markdown' | 'typst';

export type Paragraph = { from: number; text: string };

// Harper parses Typst itself; a dictionary reads no markup, so it gets the word count's prose
export function sourceProse(src: string, markup: SpellMarkup, spelling: SpellLanguage | null): TexMask {
	if (markup === 'typst') return { text: spelling === 'en' ? src : typstProse(src), spans: [] };
	const tex = maskTex(src);
	return markup === 'markdown' && spelling !== 'en' ? { text: maskMarkdown(tex.text), spans: tex.spans } : tex;
}

/** the markup a file's extension names; null for a file that is not checked */
export function spellMarkupOf(path: string): SpellMarkup | null {
	const ext = /\.([^./\\]+)$/.exec(path)?.[1]?.toLowerCase();
	if (ext === 'tex') return 'plaintext';
	if (ext === 'md' || ext === 'markdown') return 'markdown';
	if (ext === 'typ') return 'typst';
	return null;
}

// masked markup is all spaces, so blank lines in the masked text are the prose paragraph boundaries of the source
export function splitParagraphs(masked: string): Paragraph[] {
	const paras: Paragraph[] = [];
	const len = masked.length;
	let lineStart = 0;
	let paraStart = -1;
	for (let i = 0; i <= len; i++) {
		if (i < len && masked[i] !== '\n') continue;
		let blank = true;
		for (let k = lineStart; k < i; k++) {
			const c = masked[k];
			if (c !== ' ' && c !== '\t' && c !== '\r') {
				blank = false;
				break;
			}
		}
		if (!blank && paraStart < 0) paraStart = lineStart;
		else if (blank && paraStart >= 0) {
			paras.push({ from: paraStart, text: masked.slice(paraStart, lineStart) });
			paraStart = -1;
		}
		lineStart = i + 1;
	}
	if (paraStart >= 0) paras.push({ from: paraStart, text: masked.slice(paraStart, len) });
	return paras;
}
