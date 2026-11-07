// a call's argument list written back from what the file had (convert/elements/callArgs.ts)
import type { CallArgs, CallItem } from '../../convert/reading/callArgs';
import { dedentAfterFirstLine } from '../envSerializer';

export function isCallArgs(value: unknown): value is CallArgs {
	return !!value && typeof value === 'object' && Array.isArray((value as CallArgs).items);
}

export function withItem(items: CallItem[], added: Omit<CallItem, 'gap'>, at: number): CallItem[] {
	const gap = items.find((item, i) => i > 0 && item.gap.includes(','))?.gap ?? ', ';
	const out = [...items];
	out.splice(at < 0 ? out.length : at + 1, 0, { gap: out.length ? gap : '', ...added });
	return out;
}

export function callItemsSource(args: CallArgs, items: CallItem[], write: (item: CallItem) => string | null, fileIndent = ''): string {
	function kept(text: string): string {
		return dedentAfterFirstLine(text, fileIndent);
	}
	let out = '';
	let first = true;
	for (const item of items) {
		const text = write(item);
		if (text == null) continue;
		const gap = first && item !== args.items[0] ? (args.items[0]?.gap ?? '') : item.gap;
		out += kept(gap) + text;
		first = false;
	}
	return args.parens === false && !out ? '' : `(${out}${kept(args.tail)})`;
}
