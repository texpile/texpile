import type { Node } from 'prosemirror-model';

export type Render = (node: Node, inTableCell: boolean) => string;

export function floatCaptionOf(caption: Node | null, render: Render): string {
	if (!caption) return '';
	const short = typeof caption.attrs.captionOpt === 'string' && caption.attrs.captionOpt ? `[${caption.attrs.captionOpt}]` : '';
	return `\\caption${caption.attrs.starred ? '*' : ''}${short}{${render(caption, false)}}`;
}
