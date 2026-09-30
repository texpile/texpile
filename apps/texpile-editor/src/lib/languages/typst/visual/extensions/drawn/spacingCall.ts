// a space as its settings: #v(..) or #h(..), its amount, and whether it is weak (gone at the top of a page or the start
// of a line, and the smaller of two weak spaces side by side)
import type { DrawnLength } from '$lib/editor/visual/extensions/drawnChips/spaceFace';
import { isTypstLength, typstLengthOf } from './typstLength';
import { namedArg, positionalArgs, readTypstCall, rewrittenCall } from './typstCall';

export type SpacingCall = {
	vertical: boolean;
	/** as written */
	amount: string;
	/** null for an amount that is not a length (a variable, a calculation) */
	length: DrawnLength | null;
	weak: boolean;
};

export function readSpacing(source: string): SpacingCall | null {
	const call = readTypstCall(source);
	if (!call || call.form !== 'call' || (call.name !== 'v' && call.name !== 'h') || call.bodies.length) return null;
	const [amount, ...more] = positionalArgs(call);
	const weak = namedArg(call, 'weak');
	if (!amount || more.length || call.args.some((arg) => arg.name !== null && arg.name !== 'weak')) return null;
	if (weak && weak.kind !== 'Bool') return null;
	return { vertical: call.name === 'v', amount: amount.value, length: typstLengthOf(amount.node, source), weak: weak?.value === 'true' };
}

/** the space with a new amount or weakness; null for an amount that is not a length yet (still being typed) */
export function writeSpacing(source: string, next: Pick<SpacingCall, 'amount' | 'weak'>): string | null {
	const call = readTypstCall(source);
	const current = readSpacing(source);
	if (!call || !current || (next.amount !== current.amount && !isTypstLength(next.amount))) return null;
	const named: Record<string, string | null> = next.weak === current.weak ? {} : { weak: next.weak ? 'true' : null };
	return rewrittenCall(call, { positional: { 0: next.amount.trim() }, named });
}
