// a link in the theme's anchor color and decoration, as Skeleton's anchor class draws it
import type { CanvasMarkViewConstructor } from '../contracts/nodeViewTypes';
import type { StyleLook } from '../contracts/styleTypes';
import { renderFaceSpec } from '../tree/faceDocument';
import { setLook } from '../tree/faceStyle';

const ANCHOR_LOOK: StyleLook = {
	color: 'light-dark(var(--typo-anchor--color-light), var(--typo-anchor--color-dark))',
	textDecorationLine: 'var(--typo-anchor--text-decoration-line)'
};

export function linkMarkView(...[mark, , inline]: Parameters<CanvasMarkViewConstructor>): ReturnType<CanvasMarkViewConstructor> {
	const { dom, contentDOM } = renderFaceSpec(mark.type.spec.toDOM!(mark, inline));
	setLook(dom, ANCHOR_LOOK);
	return { dom, contentDOM };
}
