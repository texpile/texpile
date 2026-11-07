// the glossary and acronym entries a Typst project registers, read off the lists its register calls take
import type { TypstFileScope } from '$lib/languages/typst/knowledge';
import { dictionaryEntry } from '$lib/languages/typst/knowledge/scan/dictionaryFields';
import { childrenOf, textOf } from '$lib/languages/typst/knowledge/scan/syntax';
import { unquote, fieldItems, fieldText, resolveVariable, type FieldNode } from '$lib/languages/typst/visual/core';

export type GlossaryFields = { key: string; short?: string; long?: string; plural?: string; longplural?: string; description?: string };

const FIELDS = ['short', 'long', 'plural', 'longplural', 'description'] as const;

function entryFromDictionary(item: FieldNode, scope: TypstFileScope): GlossaryFields | null {
	function read(field: string): string | undefined {
		const node = dictionaryEntry(item.node, field, item.source);
		return (node && fieldText({ node, source: item.source }, scope)) || undefined;
	}
	const key = read('key');
	return key === undefined
		? null
		: { key, ...Object.fromEntries(FIELDS.flatMap((f) => [[f, read(f)]]).filter(([, v]) => v !== undefined)) };
}

/** `("HTML": "Hypertext Markup Language", "OS": ("operating system", "operating systems"))`: the key is the short form */
function entriesFromAcronyms(at: FieldNode, scope: TypstFileScope): GlossaryFields[] {
	const out: GlossaryFields[] = [];
	for (const keyed of resolveVariable(at, scope).node.getChildren('Keyed')) {
		const [key, value] = childrenOf(keyed).filter((c) => c.name !== 'Colon' && c.name !== 'Space');
		if (key?.name !== 'Str' || !value) continue;
		const source = resolveVariable(at, scope).source;
		const forms = value.name === 'Array' ? fieldItems({ node: value, source }, scope) : [{ node: value, source }];
		const [long, longplural] = forms.map((form) => fieldText(form, scope) || undefined);
		out.push({ key: unquote(source.slice(key.from, key.to)), short: unquote(source.slice(key.from, key.to)), long, longplural });
	}
	return out;
}

/** `complete`: every list the project registers was read, so a key none has is missing; `lets`: the names the lists are */
type Registry = { complete: boolean; lets: Set<string>; entries: Map<string, GlossaryFields> };

const read = new WeakMap<TypstFileScope, Registry>();

function registryOf(scope: TypstFileScope): Registry {
	const entries = new Map<string, GlossaryFields>();
	const lets = new Set<string>();
	let complete = true;
	function keep(entry: GlossaryFields | null): void {
		if (!entry) complete = false;
		else if (!entries.has(entry.key)) entries.set(entry.key, entry);
	}
	for (const call of scope.callsWith('entries')) {
		const list = { node: call.argument, source: call.source };
		lets.add(textOf(call.argument, call.source));
		complete &&= resolveVariable(list, call.scope).node.name === 'Array';
		for (const item of fieldItems(list, call.scope)) keep(item.node.name === 'Dict' ? entryFromDictionary(item, call.scope) : null);
	}
	for (const call of scope.callsWith('acronyms')) {
		const list = { node: call.argument, source: call.source };
		lets.add(textOf(call.argument, call.source));
		complete &&= resolveVariable(list, call.scope).node.name === 'Dict';
		entriesFromAcronyms(list, call.scope).forEach(keep);
	}
	return { complete: complete && (scope.callsWith('entries').length > 0 || scope.callsWith('acronyms').length > 0), lets, entries };
}

function registryFor(scope: TypstFileScope): Registry {
	let registry = read.get(scope);
	if (!registry) read.set(scope, (registry = registryOf(scope)));
	return registry;
}

/** whether one of the lets that hold the registered lists changed */
export function registeredListChanged(scope: TypstFileScope, changed: ReadonlySet<string>): boolean {
	return [...registryFor(scope).lets].some((name) => changed.has(name));
}

/** the entry registered under the key; null when the lists the project registers are all read and none has it,
 *  undefined when they cannot say (no call registers any, a template may take them, or a list is not written out) */
export function registeredEntry(scope: TypstFileScope, key: string): GlossaryFields | null | undefined {
	const registry = registryFor(scope);
	return registry.entries.get(key) ?? (registry.complete ? null : undefined);
}
