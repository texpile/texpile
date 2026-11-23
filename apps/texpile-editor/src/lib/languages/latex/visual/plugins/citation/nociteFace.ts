import { faceElement, setLook } from '$lib/editor/canvas';
import { tippedFace, type ChipFace } from '$lib/languages/latex/visual/core';
import { m } from '$lib/paraglide/messages';

export function nociteFace(keys: string, source: string): ChipFace {
	const list = keys.replace(/\s+/g, ' ').trim();
	const dom = faceElement('span', 'drawn-quiet', list === '*' ? m.nocite_all() : m.nocite_listed({ keys: list }));
	setLook(dom, { color: 'var(--faint-text)', fontSize: '0.85em' });
	return tippedFace(dom, source);
}
