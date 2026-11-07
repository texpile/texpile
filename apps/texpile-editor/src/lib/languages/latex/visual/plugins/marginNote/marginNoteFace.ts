import { faceElement, faceOfParts, tip, type ChipFace } from '$lib/languages/latex/visual/core';
import { m } from '$lib/paraglide/messages';
import './marginNote.css';

export function marginNoteFace(parts: ChipFace[]): ChipFace | null {
	if (parts.some((part) => part.line)) return null;
	const face = faceOfParts(parts, false);
	const dom = faceElement('span', 'drawn-margin-note');
	dom.appendChild(face.dom);
	const tipped = tip(dom, m.margin_note_hint());
	return {
		dom,
		decorate: face.decorate,
		destroy() {
			face.destroy?.();
			tipped.destroy();
		}
	};
}
