// a call's argument list written back from what the file had (convert/elements/callArgs.ts)
import type { CallArgs, CallItem } from '../../convert/reading/callArgs';
import { dedentAfterFirstLine } from '../envSerializer';

export function isCallArgs(value: unknown): value is CallArgs {
	return !!value && typeof value === 'object' && Array.isArray((value as CallArgs).items);
}

/** an item the editor adds to a call the file wrote: after `at` (or last), set off as the call's other items are */
export function withItem(items: CallItem[], added: Omit<CallItem, 'gap'>, at: number): CallItem[] {
	const gap = items.find((item, i) => i > 0 && item.gap.includes(','))?.gap ?? ', ';
	const out = [...items];
	out.splice(at < 0 ? out.length : at + 1, 0, { gap: out.length ? gap : '', ...added });
	return out;
}

/**
 * `(..)` with each item as `write` gives it, null leaving it out, and each the bytes the file put before it. `fileIndent`
 * is what the file put before the call's line, taken off the lines of what is kept as written; `write`'s own text is
 * already relative to the call.
 */
export function callItemsSource(args: CallArgs, items: CallItem[], write: (item: CallItem) => string | null, fileIndent = ''): string {
	function kept(text: string): string {
		return dedentAfterFirstLine(text, fileIndent);
	}
	let out = '';
	let first = true;
	for (const item of items) {
		const text = write(item);
		if (text == null) continue;
		// the first argument taken out: the one after it takes its place, comma and all
		const gap = first && item !== args.items[0] ? (args.items[0]?.gap ?? '') : item.gap;
		out += kept(gap) + text;
		first = false;
	}
	return args.parens === false && !out ? '' : `(${out}${kept(args.tail)})`;
}
