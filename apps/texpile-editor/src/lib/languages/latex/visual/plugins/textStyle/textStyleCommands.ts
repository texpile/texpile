import {
	markedFirst,
	STYLED,
	type ConversionContext,
	type ImportCall,
	type LatexCommandImport,
	type PmNode,
	type TreeImport
} from '$lib/languages/latex/visual/core/document';

const NOT_STYLES = new Set(['mbox', 'fbox', 'text']);

function isStyleCommand(name: string): boolean {
	return Object.hasOwn(STYLED, name) && !NOT_STYLES.has(name);
}

function styled(im: TreeImport, call: ImportCall, ctx: ConversionContext): PmNode[] {
	const run = im.core.styleArgument(call, ctx);
	const nodes = run ? im.core.inline(run.rest, run.ctx) : [];
	return nodes.length > 0 ? nodes : [im.core.chip(call, ctx)];
}

export const TEXT_STYLE_COMMANDS: Record<string, LatexCommandImport> = {
	...Object.fromEntries(Object.keys(STYLED).flatMap((name) => (isStyleCommand(name) ? [[name, styled]] : []))),
	textbf: (im, call, ctx) => markedFirst(im, call, ctx, { type: 'strong' }),
	textit: (im, call, ctx) => markedFirst(im, call, ctx, { type: 'em' }),
	emph: (im, call, ctx) => markedFirst(im, call, ctx, { type: 'em', attrs: { cmd: 'emph' } }),
	underline: (im, call, ctx) => markedFirst(im, call, ctx, { type: 'u' }),
	texttt: (im, call, ctx) => markedFirst(im, call, ctx, { type: 'code' }),
	textsuperscript: (im, call, ctx) => markedFirst(im, call, ctx, { type: 'sup' }),
	textsubscript: (im, call, ctx) => markedFirst(im, call, ctx, { type: 'sub' })
};
