// a command the document defines around one the data knows reads its arguments the same way: \newcommand\figref[1]{\ref{#1}}
// takes a label
import { callsIn, rolesOf, type CommandReadings } from './commandCalls';
import type { Argument, Role } from '../types';

/** a definition as the readings need it: the arguments it takes and its body */
export type OwnDefinition = { name: string; args: Argument[]; body: string };

const PASSED: Role[] = ['label', 'citekey', 'text', 'url', 'file', 'listing', 'graphic', 'bibfile'];
const KEPT = ['role', 'part', 'list', 'defines', 'mode', 'ext', 'appends', 'accepts', 'from'] as const;

/** the readings of the commands `definitions` make that pass a parameter whole to an argument with a role */
export function ownCommandReadings(definitions: OwnDefinition[]): CommandReadings {
	const out: CommandReadings = {};
	for (const d of definitions) {
		if (!/^[A-Za-z@]+$/.test(d.name) || !d.args.length || !d.body.includes('#')) continue;
		const args = d.args.map((a) => ({ kind: a.kind }) as Argument);
		// every argument takes a parameter number, an embellishment one per character (e{^_} is #1 and #2)
		const params = args.flatMap((a) => (a.kind.startsWith('e{') ? Array.from(a.kind.slice(2, -1), () => a) : [a]));
		let passes = false;
		for (const call of callsIn(d.body, PASSED))
			for (const a of call.args) {
				const k = /^#([1-9])$/.exec(a.values.length === 1 ? a.values[0].value : '')?.[1];
				const target = k ? params[Number(k) - 1] : undefined;
				if (!target || !rolesOf(a.arg).some((r) => PASSED.includes(r))) continue;
				for (const f of KEPT) if (a.arg[f] !== undefined) Object.assign(target, { [f]: a.arg[f] });
				passes = true;
			}
		if (passes) out[d.name] = { args };
	}
	return out;
}
