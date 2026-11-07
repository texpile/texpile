import type { NodeSpec } from 'prosemirror-model';

// the \caption of a float of a type of its own (an algorithm), standing as a block of its body
export const floatCaptionNodeSpec: NodeSpec = {
	content: 'inline*',
	group: 'block',
	// float: the float type, whose counter numbers it; starred: \caption*; captionOpt: the short caption, brackets excluded
	attrs: { float: { default: 'algorithm' }, starred: { default: false }, captionOpt: { default: null } },
	parseDOM: [{ tag: 'div.float-caption', getAttrs: (dom: HTMLElement) => ({ float: dom.getAttribute('data-float') || 'algorithm' }) }],
	toDOM: (node) => ['div', { class: 'float-caption', 'data-float': node.attrs.float }, 0]
};
