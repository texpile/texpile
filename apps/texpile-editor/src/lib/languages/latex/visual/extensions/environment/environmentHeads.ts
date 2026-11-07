// the words an environment prints before its body: a definer's title (\newtheorem{lemma}{Lemma}) in the theorem style
// set before it, else the \<name>name the loaded files print (\proofname)
import { callsIn, rolesOf, type CommandCall } from '$lib/languages/latex/knowledge/calls/commandCalls';
import { commonFacts } from '$lib/languages/latex/knowledge/commands/commandFacts';
import type { LoadedFile } from '$lib/languages/latex/knowledge/loadedFiles';
import { stackedCommands } from '$lib/languages/latex/knowledge/stackedEntries';
import { latexTreeOf } from '$lib/languages/latex/syntax/latexTrees';
import { groupInner, nextItem, wordOf } from '$lib/languages/latex/syntax/treeSiblings';
import { codeOnly } from '$lib/languages/latex/texCode';

/** amsthm's styles: plain sets the body in italics, definition and remark upright, remark's head in italics too */
export type TheoremStyle = 'plain' | 'definition' | 'remark';

/** wraps: the known environment an environment of the document's own opens first, which it prints as */
export type EnvironmentHead = { text: string; style: TheoremStyle; numbered: boolean; wraps?: string };

/** environment name to the head it prints */
export type EnvironmentHeads = Record<string, EnvironmentHead>;

function styleOf(name: string): TheoremStyle {
	return name === 'definition' || name === 'remark' ? name : 'plain';
}

// \theoremstyle{definition} applies to every definer after it
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

/** the word a command of the document's own prints (\providecommand{\remarkname}{Remark}), by name */
function ownWordsIn(code: string): Map<string, string> {
	const words = new Map<string, string>();
	for (const call of callsIn(code, ['macro'])) {
		const name = valueOf(call, 'macro')?.replace(/^\\/, '');
		const body = valueOf(call, 'body');
		if (name && body !== null && !body.includes('\\')) words.set(name, body.trim());
	}
	return words;
}

// a title written as a command (LyX's \protect\remarkname) prints the word that command prints
function titleWords(title: string, own: Map<string, string>, loaded: LoadedFile[] | undefined): string | null {
	const name = /^(?:\\protect\s*)?\\([a-zA-Z@]+)\s*$/.exec(title)?.[1];
	if (!name) return title.includes('\\') ? null : title;
	const value = own.get(name) ?? (loaded ? stackedCommands(loaded).get(name)?.value : undefined) ?? commonFacts(name).value;
	return value && !value.includes('\\') && /\p{L}/u.test(value) ? value : null;
}

/** the environments of the document's own that open a known one first: \newenvironment{svmultproof}{\begin{proof}}{...} */
export function wrappedEnvironmentsIn(code: string): Map<string, string> {
	const wraps = new Map<string, string>();
	for (const call of callsIn(code, ['environment'])) {
		const name = valueOf(call, 'environment');
		const inner = /^\s*\\begin\s*\{([^{}]+)\}/.exec(valueOf(call, 'begin') ?? '')?.[1].trim();
		if (name && inner && inner !== name) wraps.set(name, inner);
	}
	return wraps;
}

/** the heads `preamble` defines, by name; a title that is more than words stays out */
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

/** the word \<name>name prints, from the loaded files when there are some, else the common reading */
export function printedName(name: string, loaded: LoadedFile[] | undefined): string | null {
	const value = (loaded ? stackedCommands(loaded).get(`${name}name`)?.value : undefined) ?? commonFacts(`${name}name`).value;
	return value && !value.includes('\\') && /\p{L}/u.test(value) ? value : null;
}

/** the heads of the environments `names`: what `definitions` defines, else the word the loaded files print */
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
