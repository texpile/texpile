// an image back to its \includegraphics, inside the float it was read from or a new one
import type { Node } from 'prosemirror-model';
import { FIG_CAP_SLOT, FIG_IMG_SLOT, FIG_LAB_SLOT, type Ctx, type LatexSaveCore } from '$lib/languages/latex/visual/core/document';
import { buildIncludegraphics } from './includegraphics';

export function imageLatex(node: Node, _ctx: Ctx, core: LatexSaveCore): string {
	const numbered = node.attrs.numbered !== false;
	const showCaption = node.attrs.showCaption !== false;
	const graphics = buildIncludegraphics(node);
	const capContent = core.children(node, false);
	// verbatim short-caption \caption[short]{long}; see the captionOpt attr in schema.ts
	const capOpt = typeof node.attrs.captionOpt === 'string' && node.attrs.captionOpt ? `[${node.attrs.captionOpt}]` : '';
	const caption = showCaption ? `\\caption${numbered ? '' : '*'}${capOpt}{${capContent}}` : '';
	const labelText = numbered && showCaption ? String(node.attrs.label ?? '') : '';
	const label = labelText ? `\\label{${labelText}}` : '';

	// imported figure: substitute the editable bits back into the verbatim float template so
	// all surrounding scaffolding (centerline, vspace, captionsetup, placement) is preserved.
	const template = node.attrs.figureTemplate as string | null;
	if (typeof template === 'string' && template) {
		let out = template.split(FIG_IMG_SLOT).join(graphics).split(FIG_CAP_SLOT).join(caption).split(FIG_LAB_SLOT).join(label);
		// a caption added in the editor to a figure that had none has no slot to fill; drop
		// it in just before \end{figure}.
		if (showCaption && capContent && !template.includes(FIG_CAP_SLOT)) {
			out = out.replace(/\n?(\\end\{figure\*?\})\s*$/, (_whole, end: string) => `\n${caption}\n${end}`);
		}
		return out.replace(/\s*$/, '') + '\n';
	}

	// a \includegraphics that was standalone in the source round-trips bare: synthesizing a
	// \begin{figure} is often a compile error (nested floats), and this image never had a
	// \caption/\label to begin with. see the bareOriginal attr in schema.ts. A caption typed
	// in the editor since needs a float to live in, so that one does get the figure below
	if (node.attrs.bareOriginal && !(showCaption && capContent.trim())) return graphics + '\n';

	// editor-created image: a standard centered figure
	const env = node.attrs.spanning === true ? 'figure*' : 'figure';
	const captionLine = caption ? caption + '\n' : '';
	const labelLine = label ? label + '\n' : '';
	return `\\begin{${env}}[h]\n\\centering\n${graphics}\n${captionLine}${labelLine}\\end{${env}}\n`;
}
