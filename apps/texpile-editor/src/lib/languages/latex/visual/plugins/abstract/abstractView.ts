// the abstract inset like a quote with its label centered over the text, as the DOM editor's document.css drew it
import type { CanvasNodeViewConstructor, StyleLook } from '$lib/editor/canvas';
import { faceElement, renderFaceSpec, setLook } from '$lib/editor/canvas';

const ABSTRACT_LOOK: StyleLook = {
	position: 'relative',
	margin: 'calc(var(--spacing) * 6) calc(var(--spacing) * 8)',
	paddingTop: 'calc(var(--spacing) * 7)'
};
const LABEL_LOOK: StyleLook = {
	position: 'absolute',
	top: '0px',
	left: '0px',
	right: '0px',
	textAlign: 'center',
	fontSize: 'var(--text-sm)',
	lineHeight: 'var(--text-sm--line-height)',
	fontWeight: '600'
};

export function abstractView(...[node]: Parameters<CanvasNodeViewConstructor>): ReturnType<CanvasNodeViewConstructor> {
	const { dom, contentDOM } = renderFaceSpec(node.type.spec.toDOM!(node));
	setLook(dom, ABSTRACT_LOOK);
	const label = faceElement('span', undefined, 'Abstract');
	label.generated = true;
	setLook(label, LABEL_LOOK);
	dom.generatedBefore = label;
	return { dom, contentDOM };
}
