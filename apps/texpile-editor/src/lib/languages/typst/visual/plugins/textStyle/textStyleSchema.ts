// the marks of an element's call over a run of text
import type { MarkSpec } from 'prosemirror-model';
import { typstCallStyle, typstTextStyle } from '$lib/languages/typst/visual/core/document';

// `#text(1.5em, weight: "bold")[..]`: args is every byte between the parentheses, written back as it was; the mark draws
// the size, color, weight and style it knows. Calls nest, so one run can hold several
// typStr, on this and on typ_call and link: the call's body was a string, which the mark writes afresh as content
export const typTextSpec: MarkSpec = {
	attrs: { args: { default: '' }, typStr: { default: false } },
	excludes: '',
	parseDOM: [{ tag: 'span[data-typ-text]', getAttrs: (dom) => ({ args: (dom as HTMLElement).getAttribute('data-typ-text') ?? '' }) }],
	toDOM: (mark) => ['span', { 'data-typ-text': String(mark.attrs.args), style: typstTextStyle(String(mark.attrs.args)) }, 0]
};

// `#strike[..]`, `#highlight(fill: blue.C)[..]`: a styling element's call over the run, name and the bytes between its
// parentheses (null: it had none) written back as they were; the mark draws what the element does
export const typCallSpec: MarkSpec = {
	attrs: { name: { default: 'strike' }, args: { default: null }, typStr: { default: false } },
	excludes: '',
	parseDOM: [
		{
			tag: 'span[data-typ-call]',
			getAttrs: (dom) => ({
				name: (dom as HTMLElement).getAttribute('data-typ-call'),
				args: (dom as HTMLElement).getAttribute('data-args')
			})
		}
	],
	toDOM: (mark) => [
		'span',
		{ 'data-typ-call': String(mark.attrs.name), 'data-args': mark.attrs.args, style: typstCallStyle(String(mark.attrs.name)) },
		0
	]
};
