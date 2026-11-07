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
