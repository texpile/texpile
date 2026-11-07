// \nocite{keys} drawn as a quiet note: it prints nothing in the text and only adds the keys to the bibliography
import { faceElement, tippedFace, type ChipFace } from '$lib/languages/latex/visual/core';
import { m } from '$lib/paraglide/messages';
import './nocite.css';

export function nociteFace(keys: string, source: string): ChipFace {
	const dom = faceElement('span', 'drawn-quiet');
	const list = keys.replace(/\s+/g, ' ').trim();
	dom.textContent = list === '*' ? m.nocite_all() : m.nocite_listed({ keys: list });
	return tippedFace(dom, source);
}
