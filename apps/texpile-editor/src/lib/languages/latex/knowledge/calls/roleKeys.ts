// the labels and bibliography keys a text writes, and the calls that define them
import { callsIn, commonCommand, rolesOf, type CommandCall, type CommandReadings } from './commandCalls';

export type KeyRole = 'label' | 'citekey';

/** `wildcard`: \nocite{*}, every entry of the bibliography */
export type RoleKey = { key: string; at: number; command: string; call: CommandCall; wildcard: boolean };

/** the items of every argument of `role` that a call defines (\label, \bibitem) when `defining`, else that it uses
 * (\ref, \cite); `own` holds the document's wrappers (\newcommand{\mylabel}[1]{\label{#1}}); comments are the caller's to mask */
export function keysIn(text: string, role: KeyRole, defining: boolean, own?: CommandReadings): RoleKey[] {
	return callsIn(text, [role], own).flatMap((call) => {
		const nocite = commonCommand(call.command)?.cite === 'nocite';
		return call.args
			.filter((a) => rolesOf(a.arg).includes(role) && (a.arg.defines !== undefined) === defining)
			.flatMap((a) => a.values.map((v) => ({ key: v.value, at: v.at, command: call.command, call, wildcard: nocite && v.value === '*' })));
	});
}

/** `text` without the calls that define a key of `role` (\label{x}); comments are the caller's to mask */
export function withoutKeyDefinitions(text: string, role: KeyRole): string {
	let out = '';
	let from = 0;
	for (const call of new Set(keysIn(text, role, true).map((k) => k.call))) {
		out += text.slice(from, call.at);
		from = call.end;
	}
	return out + text.slice(from);
}

/** how many optional arguments a citation command writes before its key (the notes); null when the data does not know it */
export function optionalsBeforeKey(command: string): number | null {
	const args = commonCommand(command)?.args;
	const at = args?.findIndex((a) => rolesOf(a).includes('citekey') && a.defines === undefined) ?? -1;
	return args && at >= 0 ? args.slice(0, at).filter((a) => a.kind === 'o').length : null;
}
