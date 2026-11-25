// the parts of a token's declared text the engine would resolve for a computed color: the theme branch and relative oklch()
import { oklchOf, parseColor } from '../resolve/colorValue';

function closingParen(text: string, open: number): number {
	let depth = 0;
	for (let i = open; i < text.length; i++) {
		if (text[i] === '(') depth++;
		else if (text[i] === ')' && --depth === 0) return i;
	}
	return -1;
}

function splitTop(text: string, separator: RegExp): string[] {
	const parts: string[] = [];
	let depth = 0;
	let start = 0;
	for (let i = 0; i < text.length; i++) {
		if (text[i] === '(') depth++;
		else if (text[i] === ')') depth--;
		else if (depth === 0 && separator.test(text[i])) {
			if (i > start) parts.push(text.slice(start, i));
			start = i + 1;
		}
	}
	if (text.length > start) parts.push(text.slice(start));
	return parts.map((part) => part.trim());
}

/** light-dark(a, b) as the branch of the scheme, nested ones included */
export function resolveLightDark(text: string, dark: boolean): string {
	const at = text.indexOf('light-dark(');
	if (at < 0) return text;
	const open = at + 'light-dark'.length;
	const end = closingParen(text, open);
	const [light, darkBranch] = splitTop(text.slice(open + 1, end), /,/);
	const chosen = resolveLightDark(dark ? darkBranch : light, dark);
	return resolveLightDark(text.slice(0, at) + chosen + text.slice(end + 1), dark);
}

type Channels = Record<string, number>;

/** the arithmetic relative colors write on a channel: numbers, channel names, + - * /, min(), max() and calc() */
function evaluate(text: string, channels: Channels): number {
	let at = 0;
	function skip(): void {
		while (text[at] === ' ') at++;
	}
	function list(): number[] {
		const values = [sum()];
		skip();
		while (text[at] === ',') {
			at++;
			values.push(sum());
			skip();
		}
		return values;
	}
	function primary(): number {
		skip();
		if (text[at] === '(') {
			at++;
			const value = sum();
			skip();
			at++;
			return value;
		}
		const word = /^(?:[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?|[a-z]+)/i.exec(text.slice(at));
		if (!word) throw new Error(`canvas style: cannot read "${text}"`);
		at += word[0].length;
		if (text[at] === '(') {
			at++;
			const values = list();
			at++;
			if (word[0] === 'min') return Math.min(...values);
			if (word[0] === 'max') return Math.max(...values);
			return values[0];
		}
		return word[0] in channels ? channels[word[0]] : parseFloat(word[0]);
	}
	function product(): number {
		let value = primary();
		for (skip(); text[at] === '*' || text[at] === '/'; skip()) {
			const op = text[at++];
			const right = primary();
			value = op === '*' ? value * right : value / right;
		}
		return value;
	}
	function sum(): number {
		let value = product();
		for (skip(); text[at] === '+' || (text[at] === '-' && text[at + 1] === ' '); skip()) {
			const op = text[at++];
			const right = product();
			value = op === '+' ? value + right : value - right;
		}
		return value;
	}
	return sum();
}

function channelsOfOrigin(origin: string): Channels | null {
	const literal = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*(?:\/\s*([\d.]+))?\s*\)$/i.exec(origin);
	if (literal) {
		const l = parseFloat(literal[1]) / (literal[2] ? 100 : 1);
		return { l, c: parseFloat(literal[3]), h: parseFloat(literal[4]), alpha: literal[5] ? parseFloat(literal[5]) : 1 };
	}
	const color = parseColor(origin);
	if (!color) return null;
	const [l, c, h] = oklchOf(color);
	return { l, c, h, alpha: color.a };
}

/** oklch(from <color> l c h) with its channel expressions worked out, as an oklch() literal */
export function resolveRelativeColors(text: string): string {
	const at = text.indexOf('oklch(from ');
	if (at < 0) return text;
	const open = at + 'oklch'.length;
	const end = closingParen(text, open);
	const [origin, ...expressions] = splitTop(text.slice(open + 1 + 'from '.length, end), /\s/);
	const slash = expressions.indexOf('/');
	const [l, c, h] = expressions;
	const channels = channelsOfOrigin(origin);
	if (!channels || expressions.length < 3) return text;
	const alpha = slash < 0 ? channels.alpha : evaluate(expressions[slash + 1], channels);
	const result = `oklch(${evaluate(l, channels)} ${evaluate(c, channels)} ${evaluate(h, channels)} / ${alpha})`;
	return resolveRelativeColors(text.slice(0, at) + result + text.slice(end + 1));
}
