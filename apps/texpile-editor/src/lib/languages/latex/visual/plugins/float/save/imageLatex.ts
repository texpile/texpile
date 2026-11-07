import type { Node } from 'prosemirror-model';
import { FIG_CAP_SLOT, FIG_IMG_SLOT, FIG_LAB_SLOT, type Ctx, type LatexSaveCore } from '$lib/languages/latex/visual/core/document';
import { buildIncludegraphics } from './includegraphics';

export function imageLatex(node: Node, _ctx: Ctx, core: LatexSaveCore): string {
	const numbered = node.attrs.numbered !== false;
	const showCaption = node.attrs.showCaption !== false;
	const graphics = buildIncludegraphics(node);
	const capContent = core.children(node, false);
	const capOpt = typeof node.attrs.captionOpt === 'string' && node.attrs.captionOpt ? `[${node.attrs.captionOpt}]` : '';
	const caption = showCaption ? `\\caption${numbered ? '' : '*'}${capOpt}{${capContent}}` : '';
	const labelText = numbered && showCaption ? String(node.attrs.label ?? '') : '';
	const label = labelText ? `\\label{${labelText}}` : '';

	const template = node.attrs.figureTemplate as string | null;
	if (typeof template === 'string' && template) {
		let out = template.split(FIG_IMG_SLOT).join(graphics).split(FIG_CAP_SLOT).join(caption).split(FIG_LAB_SLOT).join(label);
		if (showCaption && capContent && !template.includes(FIG_CAP_SLOT)) {
			out = out.replace(/\n?(\\end\{figure\*?\})\s*$/, (_whole, end: string) => `\n${caption}\n${end}`);
		}
		return out.replace(/\s*$/, '') + '\n';
	}

	// a standalone \includegraphics stays bare (a synthesized figure can nest floats); a caption typed since gets one
	if (node.attrs.bareOriginal && !(showCaption && capContent.trim())) return graphics + '\n';

	const env = node.attrs.spanning === true ? 'figure*' : 'figure';
	const captionLine = caption ? caption + '\n' : '';
	const labelLine = label ? label + '\n' : '';
	return `\\begin{${env}}[h]\n\\centering\n${graphics}\n${captionLine}${labelLine}\\end{${env}}\n`;
}
