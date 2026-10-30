import type { Statement } from '../picture';
import type { SyntaxPart } from '../reader/syntaxParts';

export type CommandOptions = {
	/** the `[...]` right after the command, brackets included */
	span: { from: number; to: number } | null;
	/** where a new `[...]` goes when there is none */
	insertAt: number;
	items: string[];
};

/** the items, without the comments between them: a list written back has none, so no `%` can hide its `]` */
export function splitItems(text: string) {
	const inner = text.replace(/(^|[^\\])%[^\n]*/g, '$1');
	const items: string[] = [];
	let depth = 0;
	let start = 0;
	for (let i = 0; i <= inner.length; i++) {
		const ch = inner[i];
		if (ch === '{') depth++;
		else if (ch === '}') depth--;
		else if ((ch === ',' && depth === 0) || i === inner.length) {
			const item = inner.slice(start, i).trim();
			if (item) items.push(item);
			start = i + 1;
		}
	}
	return items;
}

function hasCommandOptions(st: Statement) {
	return !!st.command && (st.kind === 'path' || st.kind === 'node' || st.kind === 'frame');
}

function partsBefore(parts: SyntaxPart[], types: SyntaxPart['type'][]) {
	const k = parts.findIndex((p) => types.includes(p.type));
	return k < 0 ? parts : parts.slice(0, k);
}

function optionsOf(source: string, p: SyntaxPart): CommandOptions {
	return { span: { from: p.from, to: p.to }, insertAt: p.from, items: splitItems(source.slice(p.from + 1, p.to - 1)) };
}

export function readCommandOptions(source: string, st: Statement): CommandOptions | null {
	if (!hasCommandOptions(st)) return null;
	// a node may name itself first, `\node (a) [draw] at ...`; a path's options come right after the command
	const before = st.kind === 'node' ? partsBefore(st.parts, ['text', 'keyword']) : st.parts.slice(0, 1);
	const list = before.find((p) => p.type === 'options');
	return list ? optionsOf(source, list) : { span: null, insertAt: st.from + st.command.length, items: [] };
}

/** every `[...]` a node is written with before its text: `\node[draw] (a) [right=of b]` has two */
export function nodeOptionLists(source: string, st: Statement): CommandOptions[] {
	if (st.kind !== 'node' || !hasCommandOptions(st)) return [];
	return partsBefore(st.parts, ['text'])
		.filter((p) => p.type === 'options')
		.map((p) => optionsOf(source, p));
}

export function writeCommandOptions(source: string, options: CommandOptions, items: string[]) {
	const text = items.length ? `[${items.join(', ')}]` : '';
	const { from } = options.span ?? { from: options.insertAt };
	let { to } = options.span ?? { to: options.insertAt };
	if (!text && source[from - 1] === ' ' && source[to] === ' ') to++;
	return source.slice(0, from) + text + source.slice(to);
}
