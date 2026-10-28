// completion in a key list: the key names, then after a key= the values that key takes
import type { CompletionResult } from '@codemirror/autocomplete';
import type { Text } from '@codemirror/state';
import { docText } from '$lib/editor/source/docText';
import { keyCompletions, type KeyedArgument } from '../../../knowledge/keyCompletions';
import type { Role } from '../../../knowledge/types';
import { documentPackages } from '../../packages/loadedPackages';
import { nameStart, optionsOf, REGISTRY_ROLES } from '../registryArguments';
import { lastListToken } from '../shared';

type ListMatch = { from: number; text: string };

function uniqueRoles(roles: (Role | undefined)[]): Role[] {
	return [...new Set(roles.filter((r): r is Role => r !== undefined && REGISTRY_ROLES.includes(r)))];
}

async function registryOptions(roles: Role[], doc: Text) {
	const loaded = await documentPackages(docText(doc));
	const seen = new Set<string>();
	return roles.flatMap((r) => optionsOf(r, loaded, doc)).filter((o) => !seen.has(o.label) && !!seen.add(o.label));
}

// a key accepts what its data lists and the names of its registry roles; after a ! of a color mix, colors only
async function valuesAfterEquals(key: string, value: ListMatch, argument: KeyedArgument, doc: Text): Promise<CompletionResult | null> {
	const named = argument.keys.filter((k) => k.key === key);
	const roles = uniqueRoles(named.map((k) => k.role));
	const cut = roles.includes('color') ? nameStart('color', value.text) : 0;
	const plain = cut ? [] : named.flatMap((k) => k.values ?? []).map((label) => ({ label, type: 'constant' }));
	const options = [...plain, ...(roles.length ? await registryOptions(cut ? ['color'] : roles, doc) : [])];
	return options.length ? lastListToken({ from: value.from + cut, text: value.text.slice(cut) }, options, { lenient: true }) : null;
}

async function keysAndRoleNames(item: ListMatch, argument: KeyedArgument, doc: Text): Promise<CompletionResult | null> {
	const roles = uniqueRoles(argument.roles);
	const cut = roles.includes('color') ? nameStart('color', item.text) : 0;
	if (cut)
		return lastListToken({ from: item.from + cut, text: item.text.slice(cut) }, await registryOptions(['color'], doc), { lenient: true });
	const names = roles.length ? await registryOptions(roles, doc) : [];
	return lastListToken(item, [...keyCompletions(argument), ...names], { lenient: true });
}

/** the completions for the key list `list` ends in */
export async function keyListCompletions(list: ListMatch, argument: KeyedArgument, doc: Text): Promise<CompletionResult | null> {
	const itemAt = Math.max(list.text.lastIndexOf('{'), list.text.lastIndexOf('['), list.text.lastIndexOf(',')) + 1;
	const item = { from: list.from + itemAt, text: list.text.slice(itemAt) };
	const equals = item.text.indexOf('=');
	if (equals < 0) return keysAndRoleNames(item, argument, doc);
	const key = item.text.slice(0, equals).trim().replace(/\s+/g, ' ');
	return valuesAfterEquals(key, { from: item.from + equals + 1, text: item.text.slice(equals + 1) }, argument, doc);
}
