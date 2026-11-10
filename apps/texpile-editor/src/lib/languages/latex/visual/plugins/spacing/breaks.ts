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

export function lineBreak(im: TreeImport, call: ImportCall): PmNode[] {
	return [im.core.node('hard_break', { lineBreak: true, suffix: sliceOf(im, { from: call.node.to, to: call.to }) })];
}

export function newline(im: TreeImport): PmNode[] {
	return [im.core.node('hard_break', { lineBreak: true, command: 'newline' })];
}

export function hardBreakLatex(node: Node, ctx: Ctx): string {
	const suffix = typeof node.attrs?.suffix === 'string' ? node.attrs.suffix : '';
	// a break with nothing before it in its block stops the compile: an empty box gives it a line
	const box = opensLine(ctx) ? '\\mbox{}' : '';
	if (node.attrs?.command === 'newline' || (ctx.inTableCell && !suffix)) return `${box}\\newline\n`;
	return `${box}\\\\${suffix}${bracketFollows(ctx) ? '{}' : ''}\n`;
}
