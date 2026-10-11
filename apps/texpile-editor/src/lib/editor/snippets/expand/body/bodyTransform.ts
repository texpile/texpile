// a ${name/regex/format/options} transform, ported from VS Code's snippetParser.ts (MIT, see VENDORED-LICENSES.md)
type FormatPart = string | { group: number; shorthand?: string; ifValue?: string; elseValue?: string };

export type SnippetTransform = { regex: RegExp; format: FormatPart[] };

type Read<T> = { value: T; end: number } | null;

const SHORTHANDS: Record<string, (value: string) => string> = {
	upcase: (v) => v.toLocaleUpperCase(),
	downcase: (v) => v.toLocaleLowerCase(),
	capitalize: (v) => v[0].toLocaleUpperCase() + v.slice(1),
	pascalcase: (v) => words(v, (w) => w[0].toUpperCase() + w.slice(1)),
	camelcase: (v) => words(v, (w, i) => (i ? w[0].toUpperCase() : w[0].toLowerCase()) + w.slice(1)),
	snakecase: (v) =>
		v
			.replace(/(\p{Ll})(\p{Lu})/gu, '$1_$2')
			.replace(/[\s-]+/g, '_')
			.toLowerCase(),
	kebabcase: (v) => {
		const cleaned = v.trim().replace(/^_+|_+$/g, '');
		const parts = cleaned.match(
			/\p{Lu}{2,}(?=\p{Lu}\p{Ll}+[0-9]*|[\s_-]|$)|\p{Lu}?\p{Ll}+[0-9]*|\p{Lu}(?=\p{Lu}\p{Ll})|\p{Lu}(?=[\s_-]|$)|[0-9]+/gu
		);
		return (parts ?? cleaned.split(/[\s_-]+/).filter(Boolean)).map((w) => w.toLowerCase()).join('-');
	}
};

function words(value: string, each: (word: string, index: number) => string): string {
	const found = value.match(/[\p{L}0-9]+/gu);
	return found ? found.map(each).join('') : value;
}

/** text up to `stop`, where only \$ \} \\ are escapes */
function readUntil(src: string, start: number, stop: string): Read<string> {
	let i = start;
	while (i < src.length && src[i] !== stop) {
		if (src[i] !== '\\') i++;
		else if ('$}\\'.includes(src[i + 1] ?? '')) i += 2;
		else return null;
	}
	if (i >= src.length || i === start) return null;
	return { value: src.slice(start, i).replace(/\\([$}\\])/g, '$1'), end: i + 1 };
}

function readFormatPart(src: string, at: number): Read<FormatPart> {
	const simple = /^\$(\d+)|^\$\{(\d+)\}/.exec(src.slice(at));
	if (simple) return { value: { group: Number(simple[1] ?? simple[2]) }, end: at + simple[0].length };
	const head = /^\$\{(\d+):/.exec(src.slice(at));
	if (!head) return null;
	const group = Number(head[1]);
	const i = at + head[0].length;
	const shorthand = /^\/([_a-zA-Z][_a-zA-Z0-9]*)\}/.exec(src.slice(i));
	if (shorthand) return { value: { group, shorthand: shorthand[1] }, end: i + shorthand[0].length };
	if (src[i] === '/') return null;
	if (src[i] === '?') {
		const ifValue = readUntil(src, i + 1, ':');
		const elseValue = ifValue && readUntil(src, ifValue.end, '}');
		return elseValue ? { value: { group, ifValue: ifValue.value, elseValue: elseValue.value }, end: elseValue.end } : null;
	}
	const sign = src[i] === '+' || src[i] === '-' ? src[i] : '';
	const value = readUntil(src, i + sign.length, '}');
	if (!value) return null;
	return { value: sign === '+' ? { group, ifValue: value.value } : { group, elseValue: value.value }, end: value.end };
}

/** `from` is just after the slash that ends the name */
export function readTransform(src: string, from: number): Read<SnippetTransform> {
	let i = from;
	let source = '';
	while (src[i] !== '/') {
		if (i >= src.length) return null;
		if (src[i] === '\\' && src[i + 1] === '/') {
			source += '/';
			i += 2;
		} else source += src[i++];
	}
	i++;
	const format: FormatPart[] = [];
	let text = '';
	while (src[i] !== '/') {
		if (i >= src.length) return null;
		const part = src[i] === '$' ? readFormatPart(src, i) : null;
		if (part) {
			if (text) format.push(text);
			text = '';
			format.push(part.value);
			i = part.end;
		} else if (src[i] === '\\' && '\\/'.includes(src[i + 1] ?? '')) {
			text += src[i + 1];
			i += 2;
		} else text += src[i++];
	}
	if (text) format.push(text);
	const close = src.indexOf('}', i + 1);
	if (close < 0) return null;
	try {
		return { value: { regex: new RegExp(source, src.slice(i + 1, close)), format }, end: close + 1 };
	} catch {
		return null;
	}
}

function formatGroups(format: FormatPart[], groups: readonly (string | undefined)[]): string {
	return format
		.map((part) => {
			if (typeof part === 'string') return part;
			const value = groups[part.group] ?? '';
			if (part.shorthand) return value && SHORTHANDS[part.shorthand] ? SHORTHANDS[part.shorthand](value) : value;
			if (value && part.ifValue !== undefined) return part.ifValue;
			if (!value && part.elseValue !== undefined) return part.elseValue;
			return value;
		})
		.join('');
}

export function applyTransform(transform: SnippetTransform, value: string): string {
	let matched = false;
	const out = value.replace(transform.regex, (...args: unknown[]) => {
		matched = true;
		return formatGroups(
			transform.format,
			args.slice(
				0,
				args.findIndex((a) => typeof a === 'number')
			) as (string | undefined)[]
		);
	});
	if (!matched && transform.format.some((p) => typeof p !== 'string' && p.elseValue)) return formatGroups(transform.format, []);
	return out;
}
