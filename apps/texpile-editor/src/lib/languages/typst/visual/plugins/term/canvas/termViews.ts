// a term item: the name floats into the item's left padding and its description runs on beside it
import type { CanvasNodeViewConstructor, CanvasViewSet, StyleLook } from '$lib/editor/canvas';
import { setLook } from '$lib/editor/canvas';

const ITEM_LOOK: StyleLook = { margin: 'calc(var(--spacing) * 1) 0', paddingLeft: 'calc(var(--spacing) * 8)', display: 'flow-root' };
const TITLE_LOOK: StyleLook = { float: 'left', marginLeft: 'calc(var(--spacing) * -8)', marginRight: '0.6em', fontWeight: '600' };

function termItemView(...[, view]: Parameters<CanvasNodeViewConstructor>): ReturnType<CanvasNodeViewConstructor> {
	const dom = view.canvas.build.el('div', 'term-item');
	dom.setAttribute('data-term-item', '');
	setLook(dom, ITEM_LOOK);
	return { dom, contentDOM: dom };
}

function termTitleView(...[, view]: Parameters<CanvasNodeViewConstructor>): ReturnType<CanvasNodeViewConstructor> {
	const dom = view.canvas.build.el('div', 'term-title');
	dom.setAttribute('data-term-title', '');
	setLook(dom, TITLE_LOOK);
	return { dom, contentDOM: dom };
}

export function termViews(): CanvasViewSet {
	return { nodeViews: { term_item: termItemView, term_title: termTitleView } };
}
