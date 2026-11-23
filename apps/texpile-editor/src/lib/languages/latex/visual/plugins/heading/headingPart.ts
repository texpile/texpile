import { faceElement, setLook, type StyleLook } from '$lib/editor/canvas';
import { faceOfParts, type ChipFace } from '$lib/languages/latex/visual/core';

const HEADING_LOOK: StyleLook = {
	display: 'block',
	margin: 'calc(var(--spacing) * 2) 0 calc(var(--spacing) * 1)',
	fontWeight: '700',
	lineHeight: '1.25'
};
const SIZES = ['1.8em', '1.4em', '1.2em', '1.05em', '1em'];

export function headingPart(level: number, parts: ChipFace[], source: string): ChipFace | null {
	const body = faceOfParts(parts, false);
	const at = Math.min(Math.max(level, 0), 4);
	const dom = faceElement('div', `drawn-heading drawn-heading-${at}`);
	setLook(dom, { ...HEADING_LOOK, fontSize: SIZES[at] });
	dom.appendChild(body.dom);
	dom.hint = source;
	return { dom, line: true, decorate: body.decorate, destroy: body.destroy };
}
