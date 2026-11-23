import { faceElement, setLook } from '$lib/editor/canvas';
import { tippedFace, type ChipFace, typstLengthCss, blockStyle, namedArg } from '$lib/languages/typst/visual/core';
import { readLine } from './lineCall';

export function lineFace(source: string): ChipFace | null {
	const use = readLine(source);
	if (!use) return null;
	const length = namedArg(use.call, 'length');
	const width = length ? typstLengthCss(length.node, use.call.source) : null;
	const dom = faceElement('div', 'drawn-typst-line');
	setLook(dom, {
		height: '0',
		margin: '0.5em 0',
		width: width ?? '30pt',
		borderTop: blockStyle(use.call).border?.replace(/^none$/, '') || '1pt solid currentColor'
	});
	return tippedFace(dom, use.source, { line: true });
}
