import type { ConversionOptions } from '../../builders';
import type { ImportReadings } from '../walk/importReadings';
import type { ConversionContext, PmNode } from '../../builders';
import type { ImportCall } from '../convert/treeCalls';
import { firstBraced } from '../walk/argContent';
import type { LatexImportCore } from '$lib/languages/latex/visual/core/plugin/latexDocumentPlugin';

export type TreeImport = {
	src: string;
	readings: ImportReadings;
	options: ConversionOptions;
	lists: string[];
	delimited: Map<string, string>;
	core: LatexImportCore;
};

export type Span = { from: number; to: number };

export function sliceOf(im: TreeImport, span: Span): string {
	return im.src.slice(span.from, span.to);
}

export function chipWithoutPar(im: TreeImport, call: ImportCall): PmNode[] {
	const text = sliceOf(im, call).replace(/\s*\\par(?![a-zA-Z])\s*$/, '');
	return [im.core.chip({ from: call.from, to: call.from + text.length })];
}

export function markedFirst(im: TreeImport, call: ImportCall, ctx: ConversionContext, ...marks: ConversionContext['marks']): PmNode[] {
	const arg = firstBraced(call);
	return arg?.body ? im.core.inline(arg.body, { ...ctx, marks: [...ctx.marks, ...marks] }) : [];
}
