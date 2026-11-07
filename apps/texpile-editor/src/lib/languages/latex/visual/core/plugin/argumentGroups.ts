import type { InsertArgument } from '$lib/editor/visual/insert/insertItem';
import type { Argument } from '$lib/languages/latex/knowledge/types';
import { m } from '$lib/paraglide/messages';

type Group = { open: string; text: string };

const CLOSE: Record<string, string> = { '[': ']', '{': '}', '<': '>' };

function groupsOf(written: string): Group[] {
	const out: Group[] = [];
	let i = 0;
	while (i < written.length) {
		while (/\s/.test(written[i] ?? '')) i++;
		const open = written[i];
		const close = CLOSE[open];
		if (!close) break;
		let depth = 0;
		let j = i;
		for (; j < written.length; j++) {
			if (written[j] === '{') depth++;
			else if (written[j] === '}') depth--;
			if (depth === 0 && written[j] === close && (open !== '{' || j > i)) break;
		}
		if (j >= written.length) break;
		out.push({ open, text: written.slice(i, j + 1) });
		i = j + 1;
	}
	return out;
}

function openOf(arg: Argument): string | null {
	if (arg.kind === 'o') return '[';
	if (arg.kind === 'd<>') return '<';
	if (arg.kind === 'm' || arg.kind === 'g') return '{';
	return null;
}

// Beamer's frame tells its default overlay [<+->] from its options by the < inside
function takes(arg: Argument, group: Group): boolean {
	if (openOf(arg) !== group.open) return false;
	if (arg.kind !== 'o') return true;
	return arg.placeholder?.startsWith('<') ? group.text.startsWith('[<') : !group.text.startsWith('[<');
}

type Read = { texts: (string | null)[]; rest: string };

function readArguments(spec: readonly Argument[], written: string): Read {
	const groups = groupsOf(written);
	let at = 0;
	const texts = spec.map((arg) => (groups[at] && takes(arg, groups[at]) ? groups[at++].text : null));
	return {
		texts,
		rest: groups
			.slice(at)
			.map((g) => g.text)
			.join('')
	};
}

export function writtenArguments(spec: readonly Argument[], written: string): (string | null)[] {
	return readArguments(spec, written).texts;
}

export function missingArguments(spec: readonly Argument[], written: string): number[] {
	const texts = writtenArguments(spec, written);
	return spec.flatMap((arg, i) => ((arg.kind === 'o' || arg.kind === 'd<>') && texts[i] === null ? [i] : []));
}

export function withArgument(spec: readonly Argument[], written: string, index: number, value: string): string {
	const { texts, rest } = readArguments(spec, written);
	const open = openOf(spec[index]) ?? '[';
	const wrapped = open === '[' && spec[index].placeholder?.startsWith('<') ? `[<${value}>]` : `${open}${value}${CLOSE[open]}`;
	return texts.map((text, i) => (i === index ? wrapped : (text ?? ''))).join('') + rest;
}

export function argumentLabel(arg: Argument): string {
	if (arg.kind === 'd<>') return m.insert_argument_overlay();
	if (arg.placeholder?.startsWith('<')) return m.insert_argument_default_overlay();
	return arg.placeholder ? arg.placeholder[0].toUpperCase() + arg.placeholder.slice(1) : m.insert_argument_options();
}

export function optionalArgumentOffers(spec: readonly Argument[], written: string, attr: string, idPrefix: string): InsertArgument[] {
	return missingArguments(spec, written).map((index) => ({
		id: `${idPrefix}:${index}`,
		label: argumentLabel(spec[index]),
		asks: true,
		run: (value, pos) => (state, dispatch) => {
			dispatch?.(state.tr.setNodeAttribute(pos, attr, withArgument(spec, written, index, value)));
			return true;
		}
	}));
}
