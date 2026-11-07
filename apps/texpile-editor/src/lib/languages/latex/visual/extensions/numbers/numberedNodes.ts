// which nodes print a number
import type { Node as PMNode } from 'prosemirror-model';
import type { ChipCountsOf } from '$lib/editor/visual/extensions/drawnChips/footnoteNumbers';
import { FIG_CAP_SLOT } from '$lib/languages/latex/parser/tree/importCore/figureSlots';

/** part -1, chapter 0, section 1: the position less one is a level's depth */
export const HEADINGS = ['part', 'chapter', 'section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph'];

export type NumberedKind = 'heading' | 'figure' | 'table' | 'equation' | 'footnote' | 'theorem';

// a float steps its counter at its \caption: an image with none, or outside a float, takes no number
function hasCaption(image: PMNode): boolean {
	if (image.attrs.showCaption === false) return false;
	if (image.content.size > 0) return true;
	const template = image.attrs.figureTemplate;
	return typeof template === 'string' && template ? template.includes(FIG_CAP_SLOT) : !image.attrs.bareOriginal;
}

function hasGroupCaption(group: PMNode): boolean {
	const caption = group.lastChild;
	if (caption?.type.name !== 'figure_caption' || caption.attrs.starred) return false;
	return caption.childCount > 0 || String(group.attrs.figureTemplate ?? '').includes(FIG_CAP_SLOT);
}

function hasTableCaption(table: PMNode): boolean {
	const caption = table.firstChild;
	return caption?.type.name === 'table_caption' && caption.childCount > 0 && !caption.attrs.starred;
}

export function numberedKindOf(node: PMNode, countsOf: ChipCountsOf): NumberedKind | null {
	const name = node.type.name;
	if (name === 'heading') return node.attrs.numbered === false ? null : 'heading';
	if (name === 'image') return node.attrs.numbered === false || !hasCaption(node) ? null : 'figure';
	if (name === 'table_wrapper') return hasTableCaption(node) ? 'table' : null;
	if (name === 'figure_group') return hasGroupCaption(node) ? 'figure' : null;
	if (name === 'block_math') return node.attrs.numbered ? 'equation' : null;
	if ((name === 'inline_latex' || name === 'raw_latex') && countsOf(node.textContent).footnote?.length) return 'footnote';
	return null;
}
