import { faceElement, setLook } from '$lib/editor/canvas';
import { figurePlaceholderFace, type ChipFace } from '$lib/languages/latex/visual/core';

export function pictureFace(title: string, summary: string): ChipFace {
	const dom = faceElement('div', 'drawn-picture');
	setLook(dom, { display: 'flex', justifyContent: 'center', margin: '0.25em 0' });
	dom.appendChild(figurePlaceholderFace(title, summary));
	return { dom, line: true };
}
