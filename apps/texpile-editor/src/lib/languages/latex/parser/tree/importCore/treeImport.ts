import type { ConversionOptions } from '../../builders';
import type { ImportReadings } from '../walk/importReadings';
import type { ConversionContext, PmNode } from '../../builders';
import type { ImportCall } from '../convert/treeCalls';
import { firstBraced } from '../walk/argContent';
import type { LatexImportCore } from '$lib/languages/latex/visual/core/plugin/latexDocumentPlugin';

/** one import: the body's source, how its commands read, and the keys of the lists being converted, innermost last */
export type TreeImport = {
	src: string;
	readings: ImportReadings;
	options: ConversionOptions;
	lists: string[];
	/** \bea#1\eea: a call of the first takes everything up to the second */
	delimited: Map<string, string>;
	/** the walk and the builders, for a plugin's import */
	core: LatexImportCore;
};

export type Span = { from: number; to: number };

export function sliceOf(im: TreeImport, span: Span): string {
	return im.src.slice(span.from, span.to);
}

/** the call's bytes, a trailing \par it swallowed left out */
export function chipWithoutPar(im: TreeImport, call: ImportCall): PmNode[] {
	const text = sliceOf(im, call).replace(/\s*\\par(?![a-zA-Z])\s*$/, '');
	return [im.core.chip({ from: call.from, to: call.from + text.length })];
}

/** the first braced argument's text, wearing `marks` too */
export function markedFirst(im: TreeImport, call: ImportCall, ctx: ConversionContext, ...marks: ConversionContext['marks']): PmNode[] {
	const arg = firstBraced(call);
	return arg?.body ? im.core.inline(arg.body, { ...ctx, marks: [...ctx.marks, ...marks] }) : [];
}
