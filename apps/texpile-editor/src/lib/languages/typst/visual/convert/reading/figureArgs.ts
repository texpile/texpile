import type { SyntaxNode } from '@lezer/common';
import type { PmNode } from '../builders';
import type { TypstImport } from '../../core/plugin/typstDocumentPlugin';
import { callOf, namedKey, namedValue, readCallArgs, type CallArgs } from './callArgs';
import { childOf, children } from './syntaxUtils';

export type FigureCall = {
	body: SyntaxNode;
	caption: SyntaxNode | null;
	args: CallArgs;
};

export function figureCall(call: SyntaxNode, src: string): FigureCall | null {
	const list = callOf(call, src, 'figure');
	const found: { body: SyntaxNode | null; caption: SyntaxNode | null } = { body: null, caption: null };
	const read = list
		? readCallArgs(list, src, (item) => {
				if (item.name !== 'Named') {
					if (found.body) return null;
					found.body = item;
					return { role: 'body', text: '' };
				}
				const value = namedValue(item);
				if (!value) return null;
				if (namedKey(item, src) !== 'caption' || found.caption || (value.name !== 'ContentBlock' && value.name !== 'Str'))
					return { role: 'arg', text: src.slice(item.from, item.to) };
				found.caption = value;
				return { role: 'caption', text: src.slice(item.from, value.from), string: value.name === 'Str' };
			})
		: null;
	if (!read || read.after.length || !found.body) return null;
	return { body: found.body, caption: found.caption, args: read.args };
}

export function figureCaption(im: TypstImport, caption: SyntaxNode | null): PmNode[] {
	if (!caption) return [];
	if (caption.name === 'Str') return im.core.string(caption, im.src);
	const markup = childOf(caption, 'Markup');
	return markup ? im.core.inline(children(markup), im.src, []) : [];
}
