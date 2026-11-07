// a typ_figure as typst sets it: the body, then the caption centered under it
import type { Node } from 'prosemirror-model';
import type { NodeView } from 'prosemirror-view';
import './typstFigure.css';

export function typstFigureView(node: Node): NodeView {
	const dom = document.createElement('figure');
	dom.className = 'typ-figure';
	if (node.attrs.label) dom.dataset.label = String(node.attrs.label);
	return { dom, contentDOM: dom, update: (next) => next.type === node.type };
}
