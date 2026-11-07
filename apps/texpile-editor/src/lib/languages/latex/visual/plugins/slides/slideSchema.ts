import type { MarkSpec, NodeSpec } from 'prosemirror-model';

function attr(dom: HTMLElement, name: string, fallback = ''): string {
	return dom.getAttribute(name) ?? fallback;
}

const titleAttrs = { form: { default: 'arg' }, spec: { default: '' } };

function titleSpec(className: string): NodeSpec {
	return {
		content: 'inline*',
		isolating: true,
		attrs: titleAttrs,
		parseDOM: [
			{ tag: `div.${className}`, getAttrs: (dom: HTMLElement) => ({ form: attr(dom, 'data-form', 'arg'), spec: attr(dom, 'data-spec') }) }
		],
		toDOM: (node) => ['div', { class: className, 'data-form': node.attrs.form, 'data-spec': node.attrs.spec }, 0]
	};
}

export const slideNodeSpecs: Record<string, NodeSpec> = {
	frame: {
		content: 'frame_title? frame_subtitle? block+',
		group: 'block',
		definingAsContext: true,
		allowGapCursor: true,
		attrs: { form: { default: 'env' }, options: { default: '' } },
		parseDOM: [
			{
				tag: 'div.beamer-frame',
				getAttrs: (dom: HTMLElement) => ({ form: attr(dom, 'data-form', 'env'), options: attr(dom, 'data-options') })
			}
		],
		toDOM: (node) => ['div', { class: 'beamer-frame', 'data-form': node.attrs.form, 'data-options': node.attrs.options }, 0]
	},
	frame_title: titleSpec('slide-title'),
	frame_subtitle: titleSpec('slide-subtitle'),

	beamer_block: {
		content: 'beamer_block_title block+',
		group: 'block',
		definingAsContext: true,
		allowGapCursor: true,
		attrs: { kind: { default: 'block' }, spec: { default: '' } },
		parseDOM: [
			{ tag: 'div.beamer-block', getAttrs: (dom: HTMLElement) => ({ kind: attr(dom, 'data-kind', 'block'), spec: attr(dom, 'data-spec') }) }
		],
		toDOM: (node) => ['div', { class: 'beamer-block', 'data-kind': node.attrs.kind, 'data-spec': node.attrs.spec }, 0]
	},
	beamer_block_title: {
		content: 'inline*',
		isolating: true,
		parseDOM: [{ tag: 'div.beamer-block-title' }],
		toDOM: () => ['div', { class: 'beamer-block-title' }, 0]
	},

	columns: {
		content: 'column+',
		group: 'block',
		definingAsContext: true,
		allowGapCursor: true,
		attrs: { options: { default: '' } },
		parseDOM: [{ tag: 'div.beamer-columns', getAttrs: (dom: HTMLElement) => ({ options: attr(dom, 'data-options') }) }],
		toDOM: (node) => ['div', { class: 'beamer-columns', 'data-options': node.attrs.options }, 0]
	},
	column: {
		content: 'block+',
		isolating: true,
		definingAsContext: true,
		attrs: { form: { default: 'macro' }, options: { default: '' }, width: { default: '' } },
		parseDOM: [
			{
				tag: 'div.beamer-column',
				getAttrs: (dom: HTMLElement) => ({
					form: attr(dom, 'data-form', 'macro'),
					options: attr(dom, 'data-options'),
					width: attr(dom, 'data-width')
				})
			}
		],
		toDOM: (node) => [
			'div',
			{ class: 'beamer-column', 'data-form': node.attrs.form, 'data-options': node.attrs.options, 'data-width': node.attrs.width },
			0
		]
	}
};

export const overlayMarkSpec: MarkSpec = {
	attrs: { command: { default: 'only' }, spec: { default: '' } },
	inclusive: false,
	parseDOM: [
		{
			tag: 'span[data-overlay]',
			getAttrs: (dom: HTMLElement) => ({ command: attr(dom, 'data-command', 'only'), spec: attr(dom, 'data-overlay') })
		}
	],
	toDOM: (mark) => ['span', { class: 'beamer-overlay', 'data-overlay': mark.attrs.spec, 'data-command': mark.attrs.command }, 0]
};
