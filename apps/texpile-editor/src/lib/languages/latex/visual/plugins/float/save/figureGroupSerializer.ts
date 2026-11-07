// a figure of several images back into its float: each panel's image, caption and label into its slots
import { FIG_CAP_SLOT, FIG_LAB_SLOT } from '$lib/languages/latex/visual/core/document';
import type { Node } from 'prosemirror-model';
import { buildIncludegraphics } from './includegraphics';
import { floatCaptionOf, type Render } from './floatCaption';
import { PANEL_SLOTS, panelBox } from '../import/figureGroupTree';

/** a caption in brackets (\subfloat[...]) braces a `]` of its own */
function panelCaptionOf(image: Node, inBrackets: boolean, render: Render): string {
	const words = image.attrs.showCaption === false ? '' : render(image, false);
	return inBrackets && words.includes(']') && !/^\{[^]*\}$/.test(words) ? `{${words}}` : words;
}

export function serializeFigureGroup(node: Node, render: Render): string {
	const images: Node[] = [];
	let caption: Node | null = null;
	node.forEach((child) => {
		if (child.type.name === 'image') images.push(child);
		else caption = child;
	});
	let template = String(node.attrs.figureTemplate ?? '');
	for (let i = 0; template.includes(panelBox(i)[0]); i++) {
		const [open, close] = panelBox(i);
		const from = template.indexOf(open);
		const to = template.indexOf(close, from);
		template =
			i < images.length ? template.replace(open, '').replace(close, '') : template.slice(0, from) + template.slice(to + close.length);
	}
	let placed = 0;
	let out = template.replace(PANEL_SLOTS, (slot, kind: string, at: string, offset: number) => {
		const image = images[Number(at)];
		if (!image) return '';
		if (kind === 'Image') {
			placed = Math.max(placed, Number(at) + 1);
			return buildIncludegraphics(image);
		}
		if (kind === 'Caption') return panelCaptionOf(image, template[offset - 1] === '[', render);
		return image.attrs.label ? `\\label{${String(image.attrs.label)}}` : '';
	});
	// images dropped into the row since have no slot of their own: they follow the last one
	const added = images.slice(placed).map((image) => buildIncludegraphics(image));
	const words = floatCaptionOf(caption, render);
	const label = node.attrs.label ? `\\label{${String(node.attrs.label)}}` : '';
	out = out.split(FIG_CAP_SLOT).join(words).split(FIG_LAB_SLOT).join(label);
	const end = out.lastIndexOf('\\end{');
	const missing = [...added, ...(template.includes(FIG_CAP_SLOT) || !(caption as Node | null)?.childCount ? [] : [words])];
	if (missing.length && end >= 0) out = `${out.slice(0, end).replace(/\s*$/, '')}\n${missing.join('\n')}\n${out.slice(end)}`;
	return out.replace(/\s*$/, '') + '\n';
}
