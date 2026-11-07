// text an author added or deleted, as LyX shows a tracked change: underlined or struck through in the author's color
import { faceElement, faceOfParts, tip, type ChipFace } from '$lib/languages/latex/visual/core';
import { m } from '$lib/paraglide/messages';
import './changeFace.css';

const HUES = 360;

/** the same author gets the same color in every chip, with no list of authors to keep */
function hueOf(author: string): number {
	let hash = 0;
	for (const char of author) hash = (hash * 31 + char.charCodeAt(0)) % HUES;
	return hash;
}

/** null when a part stands on a line of its own, which no run of text holds */
export function changeFace(kind: 'added' | 'deleted', author: string, date: string, parts: ChipFace[]): ChipFace | null {
	if (parts.some((part) => part.line)) return null;
	const face = faceOfParts(parts, false);
	const dom = faceElement('span', `drawn-change drawn-change-${kind}`);
	dom.style.setProperty('--change-hue', String(hueOf(author.trim())));
	dom.appendChild(face.dom);
	const hint = (kind === 'added' ? m.drawn_change_added : m.drawn_change_deleted)({ author: author.trim(), date: date.trim() });
	const tipped = tip(dom, hint);
	return {
		dom,
		decorate: face.decorate,
		destroy() {
			face.destroy?.();
			tipped.destroy();
		}
	};
}
