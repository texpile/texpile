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
		// which command wrote it, when the file said \emph rather than \textit. They are not the same
		// thing to LaTeX (\emph toggles inside italic text) and rewriting one as the other churns the
		// file on the first edit anywhere in the block
		attrs: { cmd: { default: null } },
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

	// colors come only from the editor's own spans: a web page's text color or a spreadsheet's cell
	// fill is how that app drew it, not part of the writing
	textcolor: {
		attrs: {
			color: { default: 'black' },
			// the optional colour model of \textcolor[rgb]{...}; dropping it left an undefined colour
			model: { default: null }
		},
		parseDOM: [
			{
				tag: 'span[data-textcolor]',
				getAttrs(dom: HTMLElement) {
					return { color: dom.getAttribute('data-textcolor') || 'black', model: dom.getAttribute('data-color-model') };
				}
			}
		],
		toDOM(node) {
			const { color, model } = node.attrs;
			return ['span', { 'data-textcolor': color, ...(model ? { 'data-color-model': model } : {}), style: `color: ${color}` }, 0];
		}
	} as MarkSpec,

	highlight: {
		attrs: {
			// null: the color the document sets itself (a bare \hl in LaTeX)
			color: { default: 'yellow' },
			// 'colorbox' when LaTeX's \colorbox wrote it, a box rather than soul's \hl, and its color model
			cmd: { default: null },
			model: { default: null }
		},
		parseDOM: [
			{
				tag: 'span[data-highlight]',
				getAttrs(dom: HTMLElement) {
					return { color: dom.getAttribute('data-highlight') || null };
				}
			}
		],
		toDOM(node) {
			const color = node.attrs.color;
			return ['span', { 'data-highlight': color ?? '', style: `background-color: ${color ?? 'yellow'}; padding: 0 2px;` }, 0];
		}
	} as MarkSpec,

	code: {
		// an inline raw chip is a <code> too, and mark rules are tried before node rules
		parseDOM: [{ tag: 'code', getAttrs: (dom: HTMLElement) => (dom.classList.contains('inline-latex') ? false : null) }],
		toDOM() {
			return codeDom;
		}
	} as MarkSpec,

	// the [label] of a description item, which the editor shows as leading bold text. It carries no
	// styling of its own (the bold does that); it exists so the serializer can tell the label from
	// prose that merely starts bold, and so editing the label edits the label
	item_label: {
		parseDOM: [{ tag: 'span[data-item-label]' }],
		toDOM() {
			return ['span', { 'data-item-label': '' }, 0];
		}
	} as MarkSpec
};
