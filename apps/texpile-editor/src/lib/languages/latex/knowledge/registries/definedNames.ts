// the names a text defines for a registry: \definecolor and \colorlet for colors, \newcounter and \newtheorem for counters
import { callsIn, rolesOf, type CallArgument, type CommandCall } from '../calls/commandCalls';

export type DefinableRegistry = 'color' | 'counter';

// \newtheorem*{name} and \newtheorem{name}[shared] make an environment that counts with no counter of its own
function sharesCounter(call: CommandCall, arg: CallArgument): boolean {
	if (!rolesOf(arg.arg).includes('environment')) return false;
	return call.args.some(
		(a) => a.arg.kind === 's' || (a.index === arg.index + 1 && a.arg.kind === 'o' && rolesOf(a.arg).includes('counter'))
	);
}

/** the names comment-masked `code` defines in arguments of `role` */
export function definedNames(code: string, role: DefinableRegistry): string[] {
	const names = new Set<string>();
	for (const call of callsIn(code, [role]))
		for (const arg of call.args) {
			if (!arg.arg.defines || !rolesOf(arg.arg).includes(role) || sharesCounter(call, arg)) continue;
			for (const v of arg.values) if (!/[#\\]/.test(v.value)) names.add(v.value);
		}
	return [...names];
}
