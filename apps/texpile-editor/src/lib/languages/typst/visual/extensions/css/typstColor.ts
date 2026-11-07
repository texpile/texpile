// a Typst color expression as CSS: named colors, luma(), rgb(), and lighten/darken/transparentize on them
import type { SyntaxNode } from '@lezer/common';

type Rgba = { r: number; g: number; b: number; a: number };

const NAMED: Record<string, string> = {
	black: '#000000',
	gray: '#aaaaaa',
	silver: '#dddddd',
	white: '#ffffff',
	navy: '#001f3f',
	blue: '#0074d9',
	aqua: '#7fdbff',
	teal: '#39cccc',
	eastern: '#239dad',
	purple: '#b10dc9',
	fuchsia: '#f012be',
	maroon: '#85144b',
	red: '#ff4136',
	orange: '#ff851b',
	yellow: '#ffdc00',
	olive: '#3d9970',
	green: '#2ecc40',
	lime: '#01ff70'
};

function clamp(value: number, max: number): number {
	return Math.min(max, Math.max(0, value));
}

function byteAt(hex: string, at: number): number {
	return Number.parseInt(hex.slice(at, at + 2), 16);
}

function fromHex(text: string): Rgba | null {
	const hex = text.replace(/^#/, '');
	if (!/^([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex)) return null;
	const full = hex.length <= 4 ? [...hex].map((c) => c + c).join('') : hex;
	return { r: byteAt(full, 0), g: byteAt(full, 2), b: byteAt(full, 4), a: full.length === 8 ? byteAt(full, 6) / 255 : 1 };
}

function kids(node: SyntaxNode): SyntaxNode[] {
	const out: SyntaxNode[] = [];
	for (let c = node.firstChild; c; c = c.nextSibling) if (c.name !== 'Space') out.push(c);
	return out;
}

/** a channel written as an integer (0 to 255) or a percentage, on the 0 to 255 scale */
function channel(node: SyntaxNode, source: string): number | null {
	const text = source.slice(node.from, node.to);
	const value = Number.parseFloat(text);
	if (!Number.isFinite(value)) return null;
	if (node.name === 'Numeric') return text.endsWith('%') ? (value / 100) * 255 : null;
	return node.name === 'Int' ? value : null;
}

function positionalValues(args: SyntaxNode): SyntaxNode[] {
	return kids(args).filter((k) => !['LeftParen', 'RightParen', 'Comma'].includes(k.name));
}

function constructed(name: string, args: SyntaxNode, source: string): Rgba | null {
	const values = positionalValues(args);
	if (values.some((v) => v.name === 'Named' || v.name === 'Spread')) return null;
	const numbers = values.map((v) => channel(v, source));
	if (name === 'luma' && numbers.length >= 1 && numbers.length <= 2) {
		const [level, alpha = 255] = numbers;
		return level === null || alpha === null ? null : { r: level, g: level, b: level, a: alpha / 255 };
	}
	if (name !== 'rgb') return null;
	if (values.length === 1 && values[0].name === 'Str') return fromHex(source.slice(values[0].from + 1, values[0].to - 1));
	if (numbers.length < 3 || numbers.length > 4 || numbers.some((n) => n === null)) return null;
	const [r, g, b, alpha = 255] = numbers as number[];
	return { r, g, b, a: alpha / 255 };
}

function adjusted(color: Rgba, method: string, factor: number): Rgba | null {
	function toward(target: number, c: number): number {
		return c + (target - c) * factor;
	}
	switch (method) {
		case 'lighten':
			return { ...color, r: toward(255, color.r), g: toward(255, color.g), b: toward(255, color.b) };
		case 'darken':
			return { ...color, r: toward(0, color.r), g: toward(0, color.g), b: toward(0, color.b) };
		case 'transparentize':
			return { ...color, a: color.a * (1 - factor) };
		case 'opacify':
			return { ...color, a: color.a + (1 - color.a) * factor };
		default:
			return null;
	}
}

function colorOfNode(node: SyntaxNode, source: string): Rgba | null {
	if (node.name === 'Ident') {
		const hex = NAMED[source.slice(node.from, node.to)];
		return hex ? fromHex(hex) : null;
	}
	if (node.name === 'Parenthesized') {
		const inner = kids(node).filter((k) => k.name !== 'LeftParen' && k.name !== 'RightParen');
		return inner.length === 1 ? colorOfNode(inner[0], source) : null;
	}
	if (node.name !== 'FuncCall') return null;
	const [callee, args] = kids(node);
	if (!callee || args?.name !== 'Args') return null;
	if (callee.name === 'Ident') return constructed(source.slice(callee.from, callee.to), args, source);
	if (callee.name !== 'FieldAccess') return null;
	const [base, , method] = kids(callee);
	const values = positionalValues(args);
	const text = values.length === 1 ? source.slice(values[0].from, values[0].to) : '';
	const factor = text.endsWith('%') ? Number.parseFloat(text) / 100 : Number.NaN;
	const color = base ? colorOfNode(base, source) : null;
	return color && method && Number.isFinite(factor) ? adjusted(color, source.slice(method.from, method.to), clamp(factor, 1)) : null;
}

/** the CSS color a Typst color expression draws as, or null for anything else (gradients, tilings, other color spaces) */
export function typstColorCss(node: SyntaxNode, source: string): string | null {
	const color = colorOfNode(node, source);
	if (!color) return null;
	const [r, g, b] = [color.r, color.g, color.b].map((c) => Math.round(clamp(c, 255)));
	const alpha = Math.round(clamp(color.a, 1) * 1000) / 1000;
	return alpha === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
