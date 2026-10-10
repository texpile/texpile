import type { MarkSpec } from 'prosemirror-model';

/** a call to a function a snippet file gives a look (snippets/visual/callWrappers.ts); two may nest */
export function callMark(dialect: 'latex' | 'typst'): MarkSpec {
	return {
		attrs: { name: {}, args: { default: '' } },
		inclusive: false,
		excludes: '',
		dialect,
		parseDOM: [
			{
				tag: `span[data-call][data-call-in="${dialect}"]`,
				getAttrs: (dom: HTMLElement) => ({ name: dom.dataset.call, args: dom.dataset.callArgs ?? '' })
			}
		],
		toDOM: (mark) => [
			'span',
			{ 'data-call': mark.attrs.name, 'data-call-in': dialect, ...(mark.attrs.args ? { 'data-call-args': mark.attrs.args } : {}) },
			0
		]
	};
}
