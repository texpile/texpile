// which nodes print a number
import type { Node as PMNode } from 'prosemirror-model';
import { FIG_CAP_SLOT } from '$lib/languages/latex/parser/tree/convert/environments/figureTree';

/** part -1, chapter 0, section 1: the position less one is a level's depth */
export const HEADINGS = ['part', 'chapter', 'section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph'];

export type NumberedKind = 'heading' | 'figure' | 'table' | 'equation' | 'footnote';

// a float steps its counter at its \caption: an image with none, or outside a float, takes no number
function hasCaption(image: PMNode): boolean {
	if (image.attrs.showCaption === false) return false;
	if (image.content.size > 0) return true;
	const template = image.attrs.figureTemplate;
	return typeof template === 'string' && template ? template.includes(FIG_CAP_SLOT) : !image.attrs.bareOriginal;
}

function hasTableCaption(table: PMNode): boolean {
	const caption = table.firstChild;
	return caption?.type.name === 'table_caption' && caption.childCount > 0 && !caption.attrs.starred;
}

/** a footnote chip says so through its source: `marks` is the footnotes in it, with the number each gives itself */
export function numberedKindOf(node: PMNode, footnoteMarks: (source: string) => (number | null)[]): NumberedKind | null {
	const name = node.type.name;
	if (name === 'heading') return node.attrs.numbered === false ? null : 'heading';
	if (name === 'image') return node.attrs.numbered === false || !hasCaption(node) ? null : 'figure';
	if (name === 'table_wrapper') return hasTableCaption(node) ? 'table' : null;
	if (name === 'block_math') return node.attrs.numbered ? 'equation' : null;
	if ((name === 'inline_latex' || name === 'raw_latex') && footnoteMarks(node.textContent).length) return 'footnote';
	return null;
}
