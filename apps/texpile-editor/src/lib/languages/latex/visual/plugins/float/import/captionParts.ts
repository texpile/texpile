// which calls are captions and labels, and which argument is a caption's words, by the `part` the package data gives it
import type { ImportCall, TreeArg, TreeImport } from '$lib/languages/latex/visual/core/document';
import type { Argument } from '$lib/languages/latex/knowledge/types';
import { commonCommand, rolesOf } from '$lib/languages/latex/knowledge/calls/commandCalls';

type CaptionPart = 'caption' | 'short';

// the parse table can hold a reading without parts (the base table's \caption): the common reading's argument of the
// same kind and place among its kind stands for it
function partArgOf(im: TreeImport, call: ImportCall, part: CaptionPart): TreeArg | null {
	const reading = im.readings.argumentsOf(call.name) ?? [];
	const at = reading.findIndex((a) => a.part === part);
	if (at >= 0) return call.args[at] ?? null;
	const common: readonly Argument[] = commonCommand(call.name)?.args ?? [];
	const index = common.findIndex((a) => a.part === part);
	if (index < 0) return null;
	const kind = common[index].kind;
	const nth = common.slice(0, index).filter((a) => a.kind === kind).length;
	return call.args.filter((a) => a.kind === kind.replace(/^!/, ''))[nth] ?? null;
}

export function isCaptionCall(im: TreeImport, call: ImportCall): boolean {
	return (
		(im.readings.argumentsOf(call.name) ?? []).some((a) => a.part === 'caption') ||
		!!commonCommand(call.name)?.args.some((a) => a.part === 'caption')
	);
}

/** the words a caption shows: its caption part, else its short one, which a lone bracket of \subfloat is */
export function captionArgOf(im: TreeImport, call: ImportCall): TreeArg | null {
	for (const part of ['caption', 'short'] as const) {
		const arg = partArgOf(im, call, part);
		if (arg?.present && arg.body) return arg;
	}
	return null;
}

export function isLabelCall(im: TreeImport, call: ImportCall): boolean {
	return (im.readings.argumentsOf(call.name) ?? []).some((a) => rolesOf(a).includes('label') && a.defines === 'new');
}
