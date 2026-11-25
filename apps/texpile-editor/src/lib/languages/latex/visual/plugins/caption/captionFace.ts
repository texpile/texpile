import { faceElement, setLook } from '$lib/editor/canvas';
import { FLOAT_HEAD, faceOfParts, floatName, type ChipFace } from '$lib/languages/latex/visual/core';
import { m } from '$lib/paraglide/messages';

export function captionFace(float: string | null, words: ChipFace[]): ChipFace | null {
	const text = faceOfParts(words, false);
	const dom = faceElement('span', 'drawn-caption');
	const head = faceElement('span', 'float-caption-head', `${float ? floatName(float) : m.caption_head()}: `);
	setLook(head, { fontWeight: '600', color: 'var(--muted-text)' });
	if (!float) head.setAttribute(FLOAT_HEAD, '');
	dom.appendChild(head);
	dom.appendChild(text.dom);
	return { dom, decorate: text.decorate, destroy: text.destroy };
}
