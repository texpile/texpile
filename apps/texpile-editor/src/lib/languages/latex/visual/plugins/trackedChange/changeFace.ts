import { faceElement, setLook } from '$lib/editor/canvas';
import { faceOfParts, type ChipFace } from '$lib/languages/latex/visual/core';
import { m } from '$lib/paraglide/messages';

const HUES = 360;

function hueOf(author: string): number {
	let hash = 0;
	for (const char of author) hash = (hash * 31 + char.charCodeAt(0)) % HUES;
	return hash;
}

export function changeFace(kind: 'added' | 'deleted', author: string, date: string, parts: ChipFace[]): ChipFace | null {
	if (parts.some((part) => part.line)) return null;
	const face = faceOfParts(parts, false);
	const hue = hueOf(author.trim());
	const dom = faceElement('span', `drawn-change drawn-change-${kind}`);
	setLook(dom, {
		color: `light-dark(hsl(${hue} 70% 38%), hsl(${hue} 75% 68%))`,
		textDecorationLine: kind === 'added' ? 'underline' : 'line-through',
		textDecorationColor: 'currentColor'
	});
	dom.appendChild(face.dom);
	dom.hint = (kind === 'added' ? m.drawn_change_added : m.drawn_change_deleted)({ author: author.trim(), date: date.trim() });
	return { dom, decorate: face.decorate, destroy: face.destroy };
}
