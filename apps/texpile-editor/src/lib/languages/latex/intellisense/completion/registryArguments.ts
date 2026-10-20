// completion in the arguments the data gives a registry role: the names the loaded files provide, and the colors,
// counters and environments the document defines itself
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import type { Text } from '@codemirror/state';
import { docText } from '$lib/editor/source/docText';
import { codeOnly } from '$lib/languages/latex/texCode';
import { argumentAt, rolesOf } from '../../knowledge/calls/commandCalls';
import { definedNames, type DefinableRegistry } from '../../knowledge/registries/definedNames';
import { commonRegistry, loadedRegistry } from '../../knowledge/registries/registries';
import type { Role } from '../../knowledge/types';
import { documentPackages, type LoadedFile } from '../packages/loadedPackages';
import { packageCompletions } from '../packages/packageCompletions';
import { definedIn as definedHere } from '../../userDefinitions';
import { lastListToken } from './shared';

const REGISTRY_ROLES: Role[] = ['color', 'counter', 'pagestyle', 'language', 'bibstyle', 'environment'];
const READ_BEHIND = 2000;

const definedByDoc = new WeakMap<Text, Partial<Record<DefinableRegistry, string[]>>>();

function definedIn(doc: Text, role: DefinableRegistry): string[] {
	const cached = definedByDoc.get(doc) ?? {};
	definedByDoc.set(doc, cached);
	return (cached[role] ??= definedNames(codeOnly(docText(doc)), role));
}

function uniqueByLabel(options: Completion[]): Completion[] {
	const seen = new Set<string>();
	return options.filter((o) => !seen.has(o.label) && seen.add(o.label));
}

function languageOptions(loaded: LoadedFile[]): Completion[] {
	const chosen = new Set(loaded.flatMap((f) => [...f.options]));
	return loadedRegistry(loaded, 'languages').flatMap((l) => [
		{ label: l.name, type: 'constant', detail: l.bcp47, boost: chosen.has(l.name) ? 10 : 0 },
		...(l.aliases ?? []).map((a) => ({ label: a, type: 'constant', detail: l.name, boost: chosen.has(a) ? 10 : 0 }))
	]);
}

function optionsOf(role: Role, loaded: LoadedFile[], doc: Text): Completion[] {
	if (role === 'color') {
		const own = definedIn(doc, 'color').map((label) => ({ label, type: 'constant', detail: 'defined here' }));
		return [
			...own,
			...loadedRegistry(loaded, 'colors').map((c) => ({ label: c.name, type: 'constant', detail: c.value?.replace(':', ' ') }))
		];
	}
	if (role === 'counter') {
		const own = definedIn(doc, 'counter').map((label) => ({ label, type: 'variable', detail: 'defined here' }));
		return [...own, ...loadedRegistry(loaded, 'counters').map((c) => ({ label: c.name, type: 'variable' }))];
	}
	if (role === 'pagestyle') return loadedRegistry(loaded, 'pageStyles').map((s) => ({ label: s.name, type: 'constant' }));
	if (role === 'language') return languageOptions(loaded);
	if (role === 'environment')
		return [
			...definedHere(codeOnly(docText(doc)), 'environment').map((d) => ({ label: d.name, type: 'class', detail: 'defined here' })),
			...packageCompletions(loaded).envs.map((e) => ({ label: e.name, type: 'class' }))
		];
	// a .bst works whether or not a package loads it
	return [...loadedRegistry(loaded, 'bibStyles'), ...commonRegistry('bibStyles')].map((s) => ({ label: s.name, type: 'constant' }));
}

export async function registryArgumentCompletionSource(ctx: CompletionContext): Promise<CompletionResult | null> {
	const behind = ctx.state.sliceDoc(Math.max(0, ctx.pos - READ_BEHIND), ctx.pos);
	const open = argumentAt(behind, REGISTRY_ROLES);
	if (!open || open.arg.arg.defines) return null;
	const role = rolesOf(open.arg.arg).find((r) => REGISTRY_ROLES.includes(r))!;
	let from = ctx.pos - behind.length + open.value.at;
	let text = open.value.value;
	if (role === 'color') {
		// red!50!blue: each name after a ! is a color of its own
		const cut = text.lastIndexOf('!') + 1;
		from += cut;
		text = text.slice(cut);
	}
	const loaded = await documentPackages(docText(ctx.state.doc));
	return lastListToken({ from, text }, uniqueByLabel(optionsOf(role, loaded, ctx.state.doc)), { lenient: true });
}
