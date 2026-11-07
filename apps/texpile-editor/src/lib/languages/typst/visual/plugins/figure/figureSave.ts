// a typ_figure: its body as the code it was while it is that one block still, else a content block, then the caption
import type { Node } from 'prosemirror-model';
import { captionValue, codeHolderBody, figureSource, type Ctx, type TypstSaveCore } from '$lib/languages/typst/visual/core/document';

export function typFigureSave(node: Node, ctx: Ctx, core: TypstSaveCore): string {
	const fileIndent = core.fileIndent(node, ctx);
	const label = core.label(node);
	const blocks: Node[] = [];
	let caption: Node | null = null;
	node.forEach((child) => {
		if (child.type.name === 'typ_figure_caption') caption = child;
		else blocks.push(child);
	});
	const bodyNode = node.type.create(node.attrs, blocks);
	const body = codeHolderBody(bodyNode, core.body, fileIndent);
	const shown = caption ? captionValue(caption, core.bracketed) : null;
	const written = figureSource(node.attrs.typFigure, { body, caption: shown, label }, fileIndent);
	return (written ?? `#figure(${body}${shown != null ? `, caption: ${shown}` : ''})${label}`) + '\n\n';
}
