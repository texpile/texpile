import { callsIn } from '$lib/languages/latex/knowledge/calls/commandCalls';
import { commandsWith } from '$lib/languages/latex/knowledge/commands/commandFacts';
import { commonEnvNames, holdsMath } from '$lib/languages/latex/knowledge/environments/envFacts';
import { commandTokensOf } from '$lib/languages/latex/syntax/commandTokens';
import { latexTreeOf } from '$lib/languages/latex/syntax/latexTrees';
import { environmentName } from '$lib/languages/latex/syntax/treeMode';

export type TextSpan = { from: number; to: number };

// the alignment environments a float table can hold, which typeset alone (not the math-only ones)
const TABLE_ENVIRONMENTS = new Set(commonEnvNames((f) => !!f.cells && !holdsMath(f)));
const ALIGN_SWITCHES = new Set(commandsWith('declares', 'align'));
const FOOTNOTES = new Set(['footnote', 'footnotemark']);

export function tableSpanIn(text: string): TextSpan | null {
	let found: TextSpan | null = null;
	latexTreeOf(text).iterate({
		enter(node) {
			if (found) return false;
			if (node.name !== 'Environment') return;
			const begin = node.node.firstChild;
			if (!begin || !TABLE_ENVIRONMENTS.has(environmentName(text, begin))) return;
			if (node.node.lastChild?.name === 'EndEnv') found = { from: node.from, to: node.to };
			return false;
		}
	});
	return found;
}

export function captionSpanIn(text: string): TextSpan | null {
	const call = callsIn(text, ['text']).find((c) => c.command === 'caption' && c.args.some((a) => a.arg.kind === 'm'));
	return call ? { from: call.at, to: call.end } : null;
}

export function alignSwitchBefore(text: string, at: number): string {
	const switches = commandTokensOf(text).list.filter((t) => t.at < at && ALIGN_SWITCHES.has(t.name));
	const last = switches.at(-1);
	return last ? `\\${last.name}` : '';
}

function opensArgument(text: string, from: number): boolean {
	let at = from;
	while (/\s/.test(text[at] ?? '')) at++;
	return text[at] === '[' || text[at] === '{';
}

export function hasFootnote(text: string): boolean {
	return commandTokensOf(text).list.some((t) => FOOTNOTES.has(t.name) && opensArgument(text, t.end));
}

export function aroundSpan(text: string, span: TextSpan): string {
	return `${text.slice(0, span.from)} ${text.slice(span.to)}`;
}
