// a #figure written back with the arguments the file gave it, in the file's order: the body and the caption
// from the node, everything else as its bytes
import type { Node } from 'prosemirror-model';
import { dedentAfterFirstLine } from '../envSerializer';
import { callItemsSource, isCallArgs, withItem } from './callSource';
import { typStr } from '../typstEscapes';

export type FigureParts = {
	/** the body as code: `image(..)`, `table(..)`, a raw block, or a content block, relative to the call's line */
	body: string;
	/** the caption's value, brackets or quotes included; null for none */
	caption: string | null;
	/** the `<label>` after the call, set off as the file set it */
	label: string;
};

/** whether the file wrote the caption as a string: an image holds its caption, a figure or a table its caption node */
export function stringCaption(holder: Node): boolean {
	if (holder.type.name !== 'image') return holder.attrs.typString === true;
	const args = holder.attrs.typFigure;
	return isCallArgs(args) && args.items.some((item) => item.role === 'caption' && item.string);
}

/** a caption's value: the string the file wrote while the caption is plain text, else a content block */
export function captionValue(caption: Node, bracketed: (inline: Node) => string): string {
	let plain = true;
	caption.forEach((child) => {
		if (!child.isText || child.marks.length > 0) plain = false;
	});
	return stringCaption(caption) && plain ? typStr(caption.textContent) : `[${bracketed(caption)}]`;
}

/** what the body's line is indented by inside the call, past the call's own line: what a body written afresh
 *  indents its lines by */
export function bodyIndent(args: unknown, fileIndent = ''): string {
	const gap = isCallArgs(args) ? (args.items.find((item) => item.role === 'body')?.gap ?? '') : '';
	const line = gap.includes('\n') ? gap.slice(gap.lastIndexOf('\n') + 1) : '';
	return /^[ \t]*$/.test(line) && line.startsWith(fileIndent) ? line.slice(fileIndent.length) : '';
}

/** the call, or null when the node has no file arguments to keep (an editor-made figure). `fileIndent` is what the
 *  file put before the call's line */
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
