import { callsIn, rolesOf, type CommandCall } from '$lib/languages/latex/knowledge/calls/commandCalls';
import { commonFacts } from '$lib/languages/latex/knowledge/commands/commandFacts';
import type { LoadedFile } from '$lib/languages/latex/knowledge/loadedFiles';
import { stackedCommands } from '$lib/languages/latex/knowledge/stackedEntries';
import { latexTreeOf } from '$lib/languages/latex/syntax/latexTrees';
import { groupInner, nextItem, wordOf } from '$lib/languages/latex/syntax/treeSiblings';
import { codeOnly } from '$lib/languages/latex/texCode';

export type TheoremStyle = 'plain' | 'definition' | 'remark';

export type EnvironmentHead = { text: string; style: TheoremStyle; numbered: boolean; wraps?: string };

export type EnvironmentHeads = Record<string, EnvironmentHead>;

function styleOf(name: string): TheoremStyle {
	return name === 'definition' || name === 'remark' ? name : 'plain';
}

function stylesIn(code: string): { at: number; style: TheoremStyle }[] {
	const out: { at: number; style: TheoremStyle }[] = [];
	latexTreeOf(code).iterate({
		enter(n) {
			if (wordOf(code, n.node) !== 'theoremstyle') return;
			const inner = groupInner(code, nextItem(code, n.node));
			if (inner !== null) out.push({ at: n.from, style: styleOf(inner.trim()) });
		}
	});
	return out;
}

function valueOf(call: CommandCall, role: 'environment' | 'text' | 'macro' | 'body' | 'begin'): string | null {
	const arg = call.args.find((a) => rolesOf(a.arg).includes(role) && a.values.length);
	return arg ? arg.values[0].value.trim() : null;
}

function ownWordsIn(code: string): Map<string, string> {
	const words = new Map<string, string>();
	for (const call of callsIn(code, ['macro'])) {
		const name = valueOf(call, 'macro')?.replace(/^\\/, '');
		const body = valueOf(call, 'body');
		if (name && body !== null && !body.includes('\\')) words.set(name, body.trim());
	}
	return words;
}

function titleWords(title: string, own: Map<string, string>, loaded: LoadedFile[] | undefined): string | null {
	const name = /^(?:\\protect\s*)?\\([a-zA-Z@]+)\s*$/.exec(title)?.[1];
	if (!name) return title.includes('\\') ? null : title;
	const value = own.get(name) ?? (loaded ? stackedCommands(loaded).get(name)?.value : undefined) ?? commonFacts(name).value;
	return value && !value.includes('\\') && /\p{L}/u.test(value) ? value : null;
}

export function wrappedEnvironmentsIn(code: string): Map<string, string> {
	const wraps = new Map<string, string>();
	for (const call of callsIn(code, ['environment'])) {
		const name = valueOf(call, 'environment');
		const inner = /^\s*\\begin\s*\{([^{}]+)\}/.exec(valueOf(call, 'begin') ?? '')?.[1].trim();
		if (name && inner && inner !== name) wraps.set(name, inner);
	}
	return wraps;
}

export function definedHeads(preamble: string, loaded?: LoadedFile[]): EnvironmentHeads {
	const code = codeOnly(preamble);
	const styles = stylesIn(code);
	const own = ownWordsIn(code);
	const heads: EnvironmentHeads = {};
	for (const call of callsIn(code, ['environment'])) {
		const name = valueOf(call, 'environment');
		const title = valueOf(call, 'text');
		const text = title === null ? null : titleWords(title, own, loaded);
		if (!name || !text) continue;
		const style = styles.filter((s) => s.at < call.at).at(-1)?.style ?? 'plain';
		heads[name] = { text, style, numbered: !call.args.some((a) => a.arg.kind === 's') };
	}
	return heads;
}

export function printedName(name: string, loaded: LoadedFile[] | undefined): string | null {
	const value = (loaded ? stackedCommands(loaded).get(`${name}name`)?.value : undefined) ?? commonFacts(`${name}name`).value;
	return value && !value.includes('\\') && /\p{L}/u.test(value) ? value : null;
}

export function environmentHeadsFor(definitions: string, names: Iterable<string>, loaded: LoadedFile[] | undefined): EnvironmentHeads {
	const heads = definedHeads(definitions, loaded);
	const wraps = wrappedEnvironmentsIn(codeOnly(definitions));
	function headOf(name: string): EnvironmentHead | null {
		if (Object.hasOwn(heads, name)) return heads[name];
		const text = printedName(name, loaded);
		return text ? { text, style: 'definition', numbered: false } : null;
	}
	for (const name of names) {
		const inner = wraps.get(name);
		const head = inner ? headOf(inner) : headOf(name);
		if (head) heads[name] = inner ? { ...head, wraps: inner } : head;
	}
	return heads;
}
