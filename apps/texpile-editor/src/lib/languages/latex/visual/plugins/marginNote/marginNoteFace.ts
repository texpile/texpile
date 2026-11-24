import { faceElement, setLook } from '$lib/editor/canvas';
import { faceOfParts, type ChipFace } from '$lib/languages/latex/visual/core';
import { m } from '$lib/paraglide/messages';

export function marginNoteFace(parts: ChipFace[]): ChipFace | null {
	if (parts.some((part) => part.line)) return null;
	const face = faceOfParts(parts, false);
	const dom = faceElement('span', 'drawn-margin-note');
	setLook(dom, {
		padding: '0 0.35em',
		borderRadius: 'var(--radius-base)',
		backgroundColor: 'color-mix(in srgb, var(--faint-text) 14%, transparent)',
		color: 'var(--muted-text)',
		fontSize: '0.85em'
	});
	dom.appendChild(face.dom);
	dom.hint = m.margin_note_hint();
	return { dom, decorate: face.decorate, destroy: face.destroy };
}
