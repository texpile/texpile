import type { Node } from 'prosemirror-model';
import { dedentAfterFirstLine } from '../envSerializer';
import { callItemsSource, isCallArgs, withItem } from './callSource';
import { typStr } from '../typstEscapes';

export type FigureParts = {
	body: string;
	caption: string | null;
	label: string;
};

export function stringCaption(holder: Node): boolean {
	if (holder.type.name !== 'image') return holder.attrs.typString === true;
	const args = holder.attrs.typFigure;
	return isCallArgs(args) && args.items.some((item) => item.role === 'caption' && item.string);
}

export function captionValue(caption: Node, bracketed: (inline: Node) => string): string {
	let plain = true;
	caption.forEach((child) => {
		if (!child.isText || child.marks.length > 0) plain = false;
	});
	return stringCaption(caption) && plain ? typStr(caption.textContent) : `[${bracketed(caption)}]`;
}

export function bodyIndent(args: unknown, fileIndent = ''): string {
	const gap = isCallArgs(args) ? (args.items.find((item) => item.role === 'body')?.gap ?? '') : '';
	const line = gap.includes('\n') ? gap.slice(gap.lastIndexOf('\n') + 1) : '';
	return /^[ \t]*$/.test(line) && line.startsWith(fileIndent) ? line.slice(fileIndent.length) : '';
}

export function figureSource(args: unknown, parts: FigureParts, fileIndent = ''): string | null {
	if (!isCallArgs(args)) return null;
	let items = args.items.filter((item) => item.role !== 'caption' || parts.caption != null);
	const body = items.findIndex((item) => item.role === 'body');
	if (parts.caption != null && !items.some((item) => item.role === 'caption'))
		items = withItem(items, { role: 'caption', text: 'caption: ' }, body);
	function write(item: { role: string; text: string }): string {
		if (item.role === 'body') return parts.body;
		return item.role === 'caption' ? item.text + parts.caption : dedentAfterFirstLine(item.text, fileIndent);
	}
	return `#figure${callItemsSource(args, items, write, fileIndent)}${parts.label}`;
}
