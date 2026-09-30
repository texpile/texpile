// a break as its settings: a page break (to the next page, or to the next right- or left-hand one) or a column break,
// and whether it is weak (skipped where nothing stands before it yet)
import { unquote } from '../../convert/inlineConvert';
import { namedArg, readTypstCall, rewrittenCall } from './typstCall';

export const BREAK_KINDS = ['page', 'odd', 'even', 'column'] as const;
export type BreakKind = (typeof BREAK_KINDS)[number];

export type BreakCall = { kind: BreakKind; weak: boolean };

const KNOWN: Record<string, string[]> = { pagebreak: ['weak', 'to'], colbreak: ['weak'] };

export function readBreak(source: string): BreakCall | null {
	const call = readTypstCall(source);
	const known = call && call.form === 'call' ? KNOWN[call.name] : undefined;
	if (!call || !known || call.bodies.length || call.args.some((arg) => arg.name === null || !known.includes(arg.name))) return null;
	const weak = namedArg(call, 'weak');
	const to = namedArg(call, 'to');
	if (weak && weak.kind !== 'Bool') return null;
	const page = to && to.kind === 'Str' ? unquote(to.value) : null;
	if (to && to.kind !== 'None' && page !== 'odd' && page !== 'even') return null;
	const kind: BreakKind = call.name === 'colbreak' ? 'column' : page === 'odd' || page === 'even' ? page : 'page';
	return { kind, weak: weak?.value === 'true' };
}

/** a break turned into another kind, or weak or not; a break made strong again drops `weak:`, which it is by default */
export function writeBreak(source: string, next: BreakCall): string | null {
	const call = readTypstCall(source);
	const current = readBreak(source);
	if (!call || !current) return null;
	const named: Record<string, string | null> = {};
	if (next.weak !== current.weak) named.weak = next.weak ? 'true' : null;
	if (next.kind !== current.kind && next.kind !== 'column') named.to = next.kind === 'page' ? null : `"${next.kind}"`;
	if (next.kind === 'column') named.to = null;
	return rewrittenCall(call, { name: next.kind === 'column' ? 'colbreak' : 'pagebreak', named });
}
