import { rolesOf } from '$lib/languages/latex/knowledge/calls/commandCalls';
import { commonFacts } from '$lib/languages/latex/knowledge/commands/commandFacts';
import type { Argument, Role } from '$lib/languages/latex/knowledge/types';
import type { TreeArg, TreeCall } from '$lib/languages/latex/parser/tree/walk/treeArgs';
import { texLength } from '../reading/texLength';

const SETTING_ROLES: Role[] = ['language', 'options'];

function structural(signature: readonly Argument[], name: string): boolean {
	return commonFacts(name).section != null || signature.some((arg) => arg.part !== undefined);
}

export function takesPrintedText(name: string, signature: readonly Argument[] | undefined): boolean {
	return !!signature && !structural(signature, name) && signature.some((arg) => rolesOf(arg).includes('text'));
}

function isMeasure(text: string): boolean {
	return texLength(text) !== null || /^[+-]?\d*\.?\d+$/.test(text.trim());
}

export function printedArguments(
	call: TreeCall,
	signature: readonly Argument[] | undefined,
	textOf: (arg: TreeArg) => string
): TreeArg[] | null {
	if (!signature || !takesPrintedText(call.name, signature)) return null;
	const printed: TreeArg[] = [];
	for (const [i, arg] of call.args.entries()) {
		if (!arg.present || arg.open === '[') continue;
		const roles = rolesOf(signature[i] ?? { kind: 'm' });
		if (roles.includes('text')) printed.push(arg);
		else if (!roles.some((role) => SETTING_ROLES.includes(role)) && !(roles.length === 0 && isMeasure(textOf(arg)))) return null;
	}
	return printed.length ? printed : null;
}
