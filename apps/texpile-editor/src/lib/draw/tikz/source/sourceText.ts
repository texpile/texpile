import type { Arranged } from '$lib/draw/editor/figure/figureLanguage';

/** `text` in place of from..to; `marks` are offsets into `text`, given back as positions in the result */
export type TextEdit = { from: number; to: number; text: string; marks?: number[] };

/** edits that do not overlap, applied at once; an insert where a removal starts goes first */
export function applyTextEdits(source: string, edits: TextEdit[]): Arranged {
	const sorted = [...edits].sort((a, b) => a.from - b.from || a.to - b.to);
	let out = '';
	let last = 0;
	const at: number[] = [];
	for (const e of sorted) {
		out += source.slice(last, e.from);
		for (const m of e.marks ?? []) at.push(out.length + m);
		out += e.text;
		last = e.to;
	}
	return { source: out + source.slice(last), at };
}

export function lineStart(source: string, pos: number) {
	return source.lastIndexOf('\n', pos - 1) + 1;
}

export function lineEnd(source: string, pos: number) {
	const nl = source.indexOf('\n', pos);
	return nl < 0 ? source.length : nl;
}

export function indentAt(source: string, pos: number) {
	return /^[ \t]*/.exec(source.slice(lineStart(source, pos)))![0];
}

const IN_TEXT = /(?<!\\)([%#&_^])/g;
const IN_MATH = /(?<!\\)([%#])/g;
// a diagram's cell or arrow label is math already, and its `&` the next cell
const IN_DIAGRAM = /(?<!\\)([%#&])/g;

type TextPart = { kind: 'text' | 'math' | 'tex'; text: string };

function afterGroup(text: string, at: number, open: string, close: string) {
	let depth = 0;
	for (let i = at; i < text.length; i++) {
		if (text[i] === '\\') i++;
		else if (text[i] === open) depth++;
		else if (text[i] === close && --depth === 0) return i + 1;
	}
	return text.length;
}

function afterClose(text: string, at: number, close: string) {
	for (let i = at; i < text.length; i++) {
		if (text.startsWith(close, i)) return i + close.length;
		if (text[i] === '\\') i++;
	}
	return text.length;
}

function afterCommand(text: string, at: number, name: string) {
	if (name === 'begin') {
		const env = /^\\begin\s*\{([^}]*)\}/.exec(text.slice(at));
		if (env) return afterClose(text, at + env[0].length, `\\end{${env[1]}}`);
	}
	let i = at + name.length + 1;
	if (text[i] === '*') i++;
	for (;;) {
		const next = /^\s*/.exec(text.slice(i))![0].length + i;
		if (text[next] === '{') i = afterGroup(text, next, '{', '}');
		else if (text[next] === '[') i = afterGroup(text, next, '[', ']');
		else return i;
	}
}

function textParts(text: string) {
	const parts: TextPart[] = [];
	function add(kind: TextPart['kind'], from: number, to: number) {
		if (parts.at(-1)?.kind === kind) parts.at(-1)!.text += text.slice(from, to);
		else if (to > from) parts.push({ kind, text: text.slice(from, to) });
	}
	let i = 0;
	while (i < text.length) {
		let to = i + 1;
		let kind: TextPart['kind'] = 'text';
		if (text[i] === '$') {
			const close = text[i + 1] === '$' ? '$$' : '$';
			to = afterClose(text, i + close.length, close);
			kind = 'math';
		} else if (text[i] === '\\') {
			const name = /^[a-zA-Z@]+/.exec(text.slice(i + 1))?.[0];
			const close = text[i + 1] === '(' ? '\\)' : text[i + 1] === '[' ? '\\]' : null;
			if (close) {
				to = afterClose(text, i + 2, close);
				kind = 'math';
			} else if (name && !text.startsWith('\\mathchar"0026', i)) {
				to = afterCommand(text, i, name);
				kind = 'tex';
			} else to = i + 2;
		}
		add(kind, i, to);
		i = to;
	}
	return parts;
}

/** typed text as TeX takes it: % # & _ ^ mean themselves, commands stay as written, a diagram drops typed $ */
export function texText(text: string, diagram = false) {
	if (diagram) return text.replace(/(?<!\\)\$/g, '').replace(IN_DIAGRAM, '\\$1');
	return textParts(text)
		.map((p) =>
			p.kind === 'tex'
				? p.text
				: p.kind === 'math'
					? p.text.replace(IN_MATH, '\\$1')
					: p.text.replace(IN_TEXT, (c) => (c === '^' ? '\\^{}' : `\\${c}`))
		)
		.join('');
}

export function typedText(text: string) {
	return textParts(text)
		.map((p) =>
			p.kind === 'tex'
				? p.text
				: p.text
						.replace(/\\\^\{\}/g, '^')
						.replace(/\\mathchar"0026 ?/g, '&')
						.replace(/\\([%#&_])/g, '$1')
		)
		.join('');
}

/** the text as its lines: `\\` breaks one, unless it sits in a command's group or an environment */
export function splitTextLines(text: string) {
	const lines = [''];
	for (const p of textParts(text)) {
		if (p.kind !== 'text') {
			lines[lines.length - 1] += p.text;
			continue;
		}
		const [first, ...rest] = p.text.split(/\s*\\\\\s*/);
		lines[lines.length - 1] += first;
		lines.push(...rest);
	}
	return lines;
}

export function bracedIf(text: string, needs: RegExp) {
	return needs.test(text) && !/^\{.*\}$/s.test(text) ? `{${text}}` : text;
}

export function escapeRegExp(text: string) {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
