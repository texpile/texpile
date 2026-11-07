import { faceElement, tippedFace, type ChipFace, typstLengthCss, blockStyle, namedArg } from '$lib/languages/typst/visual/core';
import { readLine } from './lineCall';
import './lineFace.css';

export function lineFace(source: string): ChipFace | null {
	const use = readLine(source);
	if (!use) return null;
	const length = namedArg(use.call, 'length');
	const width = length ? typstLengthCss(length.node, use.call.source) : null;
	const dom = faceElement('div', 'drawn-typst-line');
	dom.style.width = width ?? '30pt';
	dom.style.borderTop = blockStyle(use.call).border?.replace(/^none$/, '') || '1pt solid currentColor';
	return tippedFace(dom, use.source, { line: true });
}
