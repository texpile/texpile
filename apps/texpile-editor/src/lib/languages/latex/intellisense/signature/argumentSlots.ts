import { rolesOf, type EnclosingCall, type IndexReading } from '../../knowledge/calls/commandCalls';
import { bracketsOf } from '../../knowledge/entryForms';
import type { Argument } from '../../knowledge/types';

export type ArgumentSlot = { open: string; close: string; label: string };

/** the slots of a command's arguments and the one holding the cursor, -1 when it is a repeated argument */
export type ArgumentHint = { command: string; at: number; slots: ArgumentSlot[]; active: number };

/** a user macro's xparse signature ("o m") as the arguments it reads as */
export function readingOfSignature(signature: string): IndexReading {
	const args: Argument[] = signature
		.split(/\s+/)
		.filter(Boolean)
		.map((token) => ({ kind: token[0] === 'O' || token[0] === 'M' ? token.toLowerCase().slice(0, 1) : token }));
	return { args };
}

/** null when the command has no argument written in brackets */
export function hintOf(call: EnclosingCall, at: number): ArgumentHint | null {
	const slots: ArgumentSlot[] = [];
	let active = -1;
	call.reading.args.forEach((arg, index) => {
		const brackets = bracketsOf(arg.kind);
		if (!brackets) return;
		if (index === call.arg.index) active = slots.length;
		slots.push({ open: brackets[0], close: brackets[1], label: arg.placeholder ?? rolesOf(arg)[0] ?? '' });
	});
	return slots.length ? { command: call.command, at, slots, active } : null;
}
