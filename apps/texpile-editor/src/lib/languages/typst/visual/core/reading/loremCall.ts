// #lorem(60): placeholder text of that many words
import { positionalArgs, readTypstCall, rewrittenCall } from './typstCall';

export type LoremCall = { words: number };

export function readLorem(source: string): LoremCall | null {
	const call = readTypstCall(source);
	if (!call || call.form !== 'call' || call.name !== 'lorem' || call.bodies.length || call.args.length !== 1) return null;
	const [words] = positionalArgs(call);
	if (!words || words.kind !== 'Int') return null;
	const count = Number.parseInt(words.value, 10);
	return Number.isSafeInteger(count) && count >= 0 ? { words: count } : null;
}

/** the call with another word count; null while the count is not a whole number */
export function writeLorem(source: string, text: string): string | null {
	const call = readTypstCall(source);
	if (!call || !readLorem(source) || !/^\d{1,5}$/.test(text.trim())) return null;
	return rewrittenCall(call, { positional: { 0: String(Number.parseInt(text, 10)) } });
}
