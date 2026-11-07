// a Typst length (5pt, 1em, 50%, 1em + 2pt) and the side lists built from it, as CSS
import type { SyntaxNode } from '@lezer/common';

const LENGTH = /^(\d+(?:\.\d*)?|\.\d+)(pt|mm|cm|in|em|%)$/;

function kids(node: SyntaxNode): SyntaxNode[] {
	const out: SyntaxNode[] = [];
	for (let c = node.firstChild; c; c = c.nextSibling) if (c.name !== 'Space') out.push(c);
	return out;
}

const SCALES: Record<string, string> = { Star: '*', Slash: '/' };

function isNumber(node: SyntaxNode): boolean {
	return node.name === 'Int' || node.name === 'Float';
}

function scaledLengthCss(node: SyntaxNode, parts: SyntaxNode[], source: string): string | null {
	if (node.name !== 'Binary' || parts.length !== 3 || !Object.hasOwn(SCALES, parts[1].name)) return null;
	const [left, operator, right] = parts;
	const factorFirst = isNumber(left) && operator.name === 'Star';
	if (!factorFirst && !isNumber(right)) return null;
	const length = typstLengthCss(factorFirst ? right : left, source);
	const factor = source.slice((factorFirst ? left : right).from, (factorFirst ? left : right).to);
	return length ? `calc(${factorFirst ? `${factor} * ${length}` : `${length} ${SCALES[operator.name]} ${factor}`})` : null;
}

export function typstLengthCss(node: SyntaxNode, source: string): string | null {
	const text = source.slice(node.from, node.to);
	if (node.name === 'Numeric') return LENGTH.test(text) ? text : null;
	if (node.name === 'Int' && text === '0') return '0';
	const parts = kids(node);
	if (node.name === 'Parenthesized' && parts.length === 3) return typstLengthCss(parts[1], source);
	if (node.name === 'Binary' && parts.length === 3 && (parts[1].name === 'Plus' || parts[1].name === 'Minus')) {
		const left = typstLengthCss(parts[0], source);
		const right = typstLengthCss(parts[2], source);
		return left && right ? `calc(${left} ${parts[1].name === 'Plus' ? '+' : '-'} ${right})` : null;
	}
	return scaledLengthCss(node, parts, source);
}

const SIDES = ['top', 'right', 'bottom', 'left'] as const;

export function typstSidesCss(node: SyntaxNode, source: string): string | null {
	const whole = typstLengthCss(node, source);
	if (whole) return whole;
	if (node.name !== 'Dict') return null;
	const given: Record<string, string> = {};
	for (const entry of kids(node)) {
		if (entry.name !== 'Named') continue;
		const [key, , value] = kids(entry);
		const length = value ? typstLengthCss(value, source) : null;
		if (!key || !length) return null;
		given[source.slice(key.from, key.to)] = length;
	}
	function side(name: (typeof SIDES)[number]): string {
		return given[name] ?? given[name === 'top' || name === 'bottom' ? 'y' : 'x'] ?? given.rest ?? '0';
	}
	return SIDES.map(side).join(' ');
}
