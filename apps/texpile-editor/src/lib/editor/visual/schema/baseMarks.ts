import type { DOMOutputSpec, MarkSpec } from 'prosemirror-model';

const emDom: DOMOutputSpec = ['em', 0],
	strongDom: DOMOutputSpec = ['strong', 0],
	codeDom: DOMOutputSpec = ['code', 0];

export const baseMarks = {
	link: {
		attrs: {
			href: {},
			title: { default: null },
			// true for a plain \url{...}: lets the serializer emit \url{href} back instead of
			// \href{href}{href} while the display text is untouched
			bare: { default: false }
		},
		inclusive: false,
		parseDOM: [
			{
				tag: 'a[href]',
				getAttrs(dom: HTMLElement) {
					return {
						href: dom.getAttribute('href'),
						title: dom.getAttribute('title')
					};
				}
			}
		],
		toDOM(node) {
			const { href, title } = node.attrs;
			return [
				'a',
				{ href, title: href, 'aria-label': title || undefined, class: 'anchor', target: '_blank', rel: 'noopener noreferrer' },
				0
			];
		}
	} as MarkSpec,

	em: {
		parseDOM: [
			{ tag: 'i' },
			{ tag: 'em' },
			{ style: 'font-style=italic' },
			{ style: 'font-style=normal', clearMark: (m) => m.type.name == 'em' }
		],
		toDOM() {
			return emDom;
		}
	} as MarkSpec,

	strong: {
		parseDOM: [
			{ tag: 'strong' },
			// Google Docs wraps pasted content in <b> tags with font-weight: normal
			{
				tag: 'b',
				getAttrs: (node: HTMLElement) => node.style.fontWeight != 'normal' && null
			},
			{ style: 'font-weight=400', clearMark: (m) => m.type.name == 'strong' },
			{
				style: 'font-weight',
				getAttrs: (value: string) => /^(bold(er)?|[5-9]\d{2,})$/.test(value) && null
			}
		],
		toDOM() {
			return strongDom;
		}
	} as MarkSpec,

	u: {
		parseDOM: [{ tag: 'u' }],
		toDOM() {
			return ['u', 0];
		}
	} as MarkSpec,

	sup: {
		excludes: 'sub',
		parseDOM: [{ tag: 'sup' }, { style: 'vertical-align=super' }],
		toDOM() {
			return ['sup', 0];
		}
	} as MarkSpec,

	sub: {
		excludes: 'sup',
		parseDOM: [{ tag: 'sub' }, { style: 'vertical-align=sub' }],
		toDOM() {
			return ['sub', 0];
		}
	} as MarkSpec,

	textcolor: {
		attrs: {
			color: { default: 'black' }
		},
		parseDOM: [
			{
				tag: 'span[data-textcolor]',
				getAttrs(dom: HTMLElement) {
					return { color: dom.getAttribute('data-textcolor') || 'black' };
				}
			},
			{
				style: 'color',
				getAttrs(value: string) {
					return { color: value };
				}
			}
		],
		toDOM(node) {
			return ['span', { 'data-textcolor': node.attrs.color, style: `color: ${node.attrs.color}` }, 0];
		}
	} as MarkSpec,

	highlight: {
		attrs: {
			color: { default: 'yellow' }
		},
		parseDOM: [
			{
				tag: 'span[data-highlight]',
				getAttrs(dom: HTMLElement) {
					return { color: dom.getAttribute('data-highlight') || 'yellow' };
				}
			},
			{
				style: 'background-color',
				getAttrs(value: string) {
					return { color: value };
				}
			}
		],
		toDOM(node) {
			return ['span', { 'data-highlight': node.attrs.color, style: `background-color: ${node.attrs.color}; padding: 0 2px;` }, 0];
		}
	} as MarkSpec,

	code: {
		parseDOM: [{ tag: 'code' }],
		toDOM() {
			return codeDom;
		}
	} as MarkSpec
};
