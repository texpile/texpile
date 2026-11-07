// the edits a layout call's settings make to its head, `#name(args)`: an argument set, or taken out when emptied
import { namedArg, positionalArgs, readTypstCall, rewrittenCall, type TypstCall } from '../../core/reading/typstCall';

export function namedValue(call: TypstCall, name: string): string {
	return namedArg(call, name)?.value ?? '';
}

export function firstPositionalValue(call: TypstCall): string {
	return positionalArgs(call)[0]?.value ?? '';
}

export function withNamedArg(source: string, name: string, value: string): string | null {
	const call = readTypstCall(source);
	if (!call) return null;
	return rewrittenCall(call, { named: { [name]: value.trim() === '' ? null : value.trim() } });
}

export function withFirstPositional(source: string, value: string): string | null {
	const call = readTypstCall(source);
	if (!call || call.open === null) return null;
	const text = value.trim();
	if (positionalArgs(call).length) return text ? rewrittenCall(call, { positional: { 0: text } }) : null;
	if (!text) return source;
	return `${source.slice(0, call.open + 1)}${text}${call.args.length ? ', ' : ''}${source.slice(call.open + 1)}`;
}
