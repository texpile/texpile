// \textcolor, \hl and \colorbox to the color and highlight marks, and back
import {
	argText,
	argTextContent,
	esc,
	mandatoryArgs,
	optionalArg,
	xcolorOf,
	type ConversionContext,
	type ImportCall,
	type PmNode,
	type TreeImport
} from '$lib/languages/latex/visual/core/document';

export function colorMark(
	im: TreeImport,
	call: ImportCall,
	ctx: ConversionContext,
	type: string,
	extra: Record<string, unknown> = {}
): PmNode[] | null {
	const braced = mandatoryArgs(call);
	if (braced.length < 2 || !braced[1].body) return null;
	const color = argTextContent(im, braced[0]);
	const modelArg = optionalArg(call);
	const model = modelArg ? argText(im.src, modelArg) : null;
	return im.core.inline(braced[1].body, { ...ctx, marks: [...ctx.marks, { type, attrs: { color, ...extra, model } }] });
}

// a color xcolor cannot read drops its wrapper and keeps the text, as the Typst serializer does
export function textcolorMark(a: Record<string, unknown>): { open: string; close: string } {
	const c = xcolorOf(a.color ?? 'black', a.model);
	return c ? { open: `\\textcolor${c.model ? `[${c.model}]` : ''}{${esc(c.value)}}{`, close: '}' } : { open: '', close: '' };
}

// \sethlcolor takes a color name, never a model, so a color only a model can say highlights in the default one
export function highlightMark(a: Record<string, unknown>): { open: string; close: string } {
	if (a.cmd === 'colorbox') {
		const box = xcolorOf(a.color ?? 'yellow', a.model);
		if (box) return { open: `\\colorbox${box.model ? `[${box.model}]` : ''}{${esc(box.value)}}{`, close: '}' };
	}
	const c = a.color == null ? null : xcolorOf(a.color, null);
	return c && !c.model ? { open: `{\\sethlcolor{${esc(c.value)}}\\hl{`, close: '}}' } : { open: '\\hl{', close: '}' };
}
