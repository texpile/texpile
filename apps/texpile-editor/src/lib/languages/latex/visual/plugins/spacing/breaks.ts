// \\ and \newline as line breaks, \par as the paragraph end it is
import type { Node } from 'prosemirror-model';
import {
	bracketFollows,
	opensLine,
	sliceOf,
	type Ctx,
	type ImportCall,
	type PmNode,
	type TreeImport
} from '$lib/languages/latex/visual/core/document';

// suffix keeps \\* and \\[2ex] as written; command tells \newline from \\ (in a p{} cell \\ ends the row)
export function lineBreak(im: TreeImport, call: ImportCall): PmNode[] {
	return [im.core.node('hard_break', { lineBreak: true, suffix: sliceOf(im, { from: call.node.to, to: call.to }) })];
}

export function newline(im: TreeImport): PmNode[] {
	return [im.core.node('hard_break', { lineBreak: true, command: 'newline' })];
}

export function hardBreakLatex(node: Node, ctx: Ctx): string {
	// legacy lineBreak:false (a blank-line gap) is a semantic no-op: emit nothing
	if (node.attrs?.lineBreak === false) return '';
	const suffix = typeof node.attrs?.suffix === 'string' ? node.attrs.suffix : '';
	// with nothing drawn before it in its block (an item's start, a \label) a break has no line to
	// end, which stops the compile: an empty box gives it one
	const box = opensLine(ctx) ? '\\mbox{}' : '';
	if (node.attrs?.command === 'newline' || (ctx.inTableCell && !suffix)) return `${box}\\newline\n`;
	return `${box}\\\\${suffix}${bracketFollows(ctx) ? '{}' : ''}\n`;
}
