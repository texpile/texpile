import {
	mandatoryArgs,
	sliceOf,
	type ConversionContext,
	type ImportCall,
	type PmNode,
	type TreeImport
} from '$lib/languages/latex/visual/core/document';

export function overlay(im: TreeImport, call: ImportCall, ctx: ConversionContext): PmNode[] {
	const spec = call.args.find((a) => a.present && a.kind === 'd<>');
	const text = mandatoryArgs(call)[0]?.body;
	const inner = spec && text && text.to > text.from && !ctx.marks.some((m) => m.type === 'overlay') ? text : null;
	if (!spec || !inner) return [im.core.chip(call, ctx)];
	const marks = [...ctx.marks, { type: 'overlay', attrs: { command: call.name, spec: sliceOf(im, spec) } }];
	const nodes = im.core.inline(inner, { ...ctx, marks });
	return nodes.length > 0 ? nodes : [im.core.chip(call, ctx)];
}
