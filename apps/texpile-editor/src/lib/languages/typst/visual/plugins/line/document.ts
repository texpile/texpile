// `#line(length: 100%, stroke: 0.5pt)`: a full-width line, which the editor draws as a divider
import type { SyntaxNode } from '@lezer/common';
import {
	aloneWithLabel,
	callOf,
	namedKey,
	namedValue,
	readCallArgs,
	type TypstDocumentPlugin,
	type TypstImport,
	type TypstSeg
} from '$lib/languages/typst/visual/core/document';
import { readLine } from './lineCall';

function dividerCall(hash: SyntaxNode, call: SyntaxNode, src: string): string | null {
	const list = callOf(call, src, 'line');
	let full = false;
	const read = list
		? readCallArgs(list, src, (item) => {
				const key = item.name === 'Named' ? namedKey(item, src) : '';
				const value = key === 'length' ? namedValue(item) : null;
				if (value) full = src.slice(value.from, value.to) === '100%';
				return key === 'length' || key === 'stroke' ? { role: 'arg', text: '' } : null;
			})
		: null;
	return full && read && !read.after.length && read.args.parens !== false ? src.slice(hash.from, call.to) : null;
}

function dividerSeg(im: TypstImport, kids: SyntaxNode[], i: number): { seg: TypstSeg; next: number } | null {
	const hash = kids[i];
	const call = kids[i + 1];
	const alone = aloneWithLabel(kids, i + 2, im.src);
	const divider = alone && !alone.label ? dividerCall(hash, call, im.src) : null;
	if (!alone || !divider) return null;
	return { seg: { blocks: [im.core.node('horizontal_rule', { typCall: divider })], from: hash.from, to: call.to }, next: alone.next };
}

export const lineDocument: TypstDocumentPlugin = {
	import: { calls: { blocks: { line: dividerSeg } }, chips: (source) => readLine(source.trim()) !== null },
	// typCall: a divider the file wrote as a `#line(..)` other than the editor's own, as written; after typGap, every
	// block's, where the schema has always had it
	schema: ({ nodes, marks }) => {
		const rule = nodes.get('horizontal_rule')!;
		const attrs = { ...rule.attrs, typGap: { default: null }, typCall: { default: null } };
		return { nodes: nodes.update('horizontal_rule', { ...rule, attrs }), marks };
	},
	save: {
		nodes: { horizontal_rule: (node) => `${typeof node.attrs.typCall === 'string' ? node.attrs.typCall : '#line(length: 100%)'}\n\n` },
		wholeRun: (node) => node.type.name === 'horizontal_rule'
	}
};
