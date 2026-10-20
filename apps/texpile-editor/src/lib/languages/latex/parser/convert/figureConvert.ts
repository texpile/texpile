// figure environments: image extraction, caption/label slots, the slotified raw template
// mutually recursive with the walkers in converter.ts; ESM live bindings make the circular import safe
import type { Node, Macro, Environment } from '@unified-latex/unified-latex-types';
import { printRaw } from '@unified-latex/unified-latex-util-print-raw';
import { getTextContent, getMacroFirstArg } from '../ast-utils';
import { buildNode, nodeToLatexString, type PmNode, type ConversionContext, type ConversionOptions } from '../builders';
import { convertNodesToInline } from './inlineConvert';
import { nodeRawSource, nodeRawSpan, rawTextNode } from './origCapture';
import { macroHandlers, macroHasStar } from './macroHandlers';

export const FIG_IMG_SLOT = '\\TexpileFigImageSlot';
export const FIG_CAP_SLOT = '\\TexpileFigCaptionSlot';
export const FIG_LAB_SLOT = '\\TexpileFigLabelSlot';

/** Collect every macro named `name` anywhere in the tree (descending into macro args and groups). */
export function collectMacrosDeep(nodes: readonly Node[], name: string, out: Macro[] = []): Macro[] {
	for (const n of nodes) {
		if (n.type === 'macro' && (n as Macro).content === name) out.push(n as Macro);
		const args = (n as Macro).args;
		if (args) for (const a of args) collectMacrosDeep(a.content, name, out);
		const content = (n as { content?: unknown }).content;
		if (Array.isArray(content)) collectMacrosDeep(content as Node[], name, out);
	}
	return out;
}

/**
 * The float's OWN source with the three editable macros swapped for sentinels, so its line breaks
 * and indentation survive an edit. printRaw reprints from the tree, which turns every newline into
 * a space: a caption edit used to collapse the whole float onto one line. Only for the plain case
 * of one macro each; anything else falls back to the reprint, which is merely ugly, not wrong.
 */
function figureTemplateFromSource(env: Environment): string | null {
	const raw = nodeRawSource(env);
	if (!raw) return null;
	let out = raw;
	for (const [name, slot] of [
		['includegraphics', FIG_IMG_SLOT],
		['caption', FIG_CAP_SLOT],
		['label', FIG_LAB_SLOT]
	] as const) {
		const found = collectMacrosDeep(env.content, name);
		if (found.length === 0) continue;
		if (found.length > 1) return null;
		const text = nodeRawSource(found[0]);
		if (!text || out.indexOf(text) !== out.lastIndexOf(text)) return null;
		out = out.replace(text, slot);
	}
	return out;
}

/** Deep-clone a figure subtree, swapping \includegraphics/\caption/\label for sentinel tokens. */
export function slotifyFigure(node: Node): Node {
	if (node.type === 'macro') {
		const m = node as Macro;
		if (m.content === 'includegraphics') return { type: 'string', content: FIG_IMG_SLOT } as unknown as Node;
		if (m.content === 'caption') return { type: 'string', content: FIG_CAP_SLOT } as unknown as Node;
		if (m.content === 'label') return { type: 'string', content: FIG_LAB_SLOT } as unknown as Node;
		if (m.args) return { ...m, args: m.args.map((a) => ({ ...a, content: a.content.map(slotifyFigure) })) } as unknown as Node;
		return node;
	}
	const content = (node as { content?: unknown }).content;
	if (Array.isArray(content)) return { ...(node as object), content: (content as Node[]).map(slotifyFigure) } as unknown as Node;
	return node;
}

export function createFigureWrapper(env: Environment, ctx: ConversionContext, _options: ConversionOptions): PmNode[] {
	const graphics = collectMacrosDeep(env.content, 'includegraphics');

	// tier 1: exactly one image anywhere in the float. model it as an editable image whose whole
	// \begin{figure}...\end{figure} is preserved as a slot template, so scaffolding (\centerline,
	// \vspace, \captionsetup, placement) round-trips untouched.
	// the image holds one caption and one label; a float with more (subfigures' \label{fig:3a}) stays verbatim
	const single = collectMacrosDeep(env.content, 'caption').length <= 1 && collectMacrosDeep(env.content, 'label').length <= 1;
	if (graphics.length === 1 && single) {
		const result = macroHandlers.includegraphics(graphics[0], ctx);
		const imageAttrs = result && result.length > 0 ? { ...result[0].attrs } : null;
		if (imageAttrs) {
			const captionMacro = collectMacrosDeep(env.content, 'caption')[0];
			const captionNodes = captionMacro ? convertNodesToInline(getMacroFirstArg(captionMacro), ctx) : [];
			// the slot replaces the whole \caption, so \caption[short]{long}'s optional arg must
			// be carried separately or it silently vanishes.
			const capOptArg = captionMacro?.args?.find((a) => a.openMark === '[');
			const captionOpt = capOptArg ? printRaw(capOptArg.content) : null;
			const labelMacro = collectMacrosDeep(env.content, 'label')[0];
			const mand = labelMacro?.args?.filter((a) => a.openMark === '{') || [];
			const label = mand[0] ? getTextContent(mand[0].content) : null;
			const figureTemplate = figureTemplateFromSource(env) ?? nodeToLatexString(slotifyFigure(env));
			// bareOriginal is about a STANDALONE call: false here, this one came from a real figure
			// \caption* is an unnumbered caption, the same thing the editor's numbered toggle means
			const numbered = captionMacro ? !macroHasStar(captionMacro) : true;
			return [
				buildNode(
					'image',
					{ ...imageAttrs, label, figureTemplate, captionOpt, numbered, bareOriginal: false },
					captionNodes.length > 0 ? captionNodes : null
				)
			];
		}
	}

	// tier 2/3 (subfigures, tikz, no graphic): preserve the float verbatim
	return [buildNode('raw_latex', null, [rawTextNode(nodeRawSpan(env), nodeToLatexString(env))])];
}
