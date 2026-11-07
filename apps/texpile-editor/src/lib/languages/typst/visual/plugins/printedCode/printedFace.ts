// a call that prints the text it is given as code, drawn as that text in the editor's code type: inline among the words,
// or as a block when the call says so
import { tippedFace, type ChipFace } from '$lib/languages/typst/visual/core';
import { readPrinted } from './printedCall';

export function printedFace(source: string): ChipFace | null {
	const read = readPrinted(source);
	if (!read) return null;
	const { use, text, block } = read;
	const dom = document.createElement(block ? 'pre' : 'code');
	dom.textContent = text;
	return tippedFace(dom, use.source, { line: block });
}
