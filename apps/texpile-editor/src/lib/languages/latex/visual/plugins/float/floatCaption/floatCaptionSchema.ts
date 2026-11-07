import type { NodeSpec } from 'prosemirror-model';

export const floatCaptionNodeSpec: NodeSpec = {
	content: 'inline*',
	group: 'block',
	attrs: { float: { default: 'algorithm' }, starred: { default: false }, captionOpt: { default: null } },
	parseDOM: [{ tag: 'div.float-caption', getAttrs: (dom: HTMLElement) => ({ float: dom.getAttribute('data-float') || 'algorithm' }) }],
	toDOM: (node) => ['div', { class: 'float-caption', 'data-float': node.attrs.float }, 0]
};
