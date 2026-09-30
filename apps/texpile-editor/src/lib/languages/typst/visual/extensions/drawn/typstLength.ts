// a Typst length as the editor draws it (1em, 2.5cm, 50%, 1fr, and sums of them such as 1em + 2pt), read off the
// parsed expression so only what Typst itself reads as a length counts
import type { SyntaxNode } from '@lezer/common';
import type { DrawnLength } from '$lib/editor/visual/extensions/drawnChips/spaceFace';
import { positionalArgs, readTypstCall } from './typstCall';

// points per unit, a Typst point being 1/72 in; the editor's em stands for the default 11pt text
const POINTS: Record<string, number> = { pt: 1, mm: 72 / 25.4, cm: 72 / 2.54, in: 72 };
const POINTS_PER_EM = 11;
const NUMERIC = /^(\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?(pt|mm|cm|in|em|fr|%)$/;

type Measure = { em: number; share: number; fr: number };

function scaled(measure: Measure, by: number): Measure {
	return { em: measure.em * by, share: measure.share * by, fr: measure.fr * by };
}

function sum(a: Measure, b: Measure): Measure {
	return { em: a.em + b.em, share: a.share + b.share, fr: a.fr + b.fr };
}

function numeric(text: string): Measure | null {
	const m = NUMERIC.exec(text);
	if (!m) return null;
	const amount = Number.parseFloat(text);
	if (!Number.isFinite(amount)) return null;
	const unit = m[2];
	if (unit === 'em') return { em: amount, share: 0, fr: 0 };
	if (unit === '%') return { em: 0, share: amount / 100, fr: 0 };
	if (unit === 'fr') return { em: 0, share: 0, fr: amount };
	return { em: (amount * POINTS[unit]) / POINTS_PER_EM, share: 0, fr: 0 };
}

function measured(node: SyntaxNode, source: string): Measure | null {
	const kids: SyntaxNode[] = [];
	for (let c = node.firstChild; c; c = c.nextSibling) if (c.name !== 'Space') kids.push(c);
	if (node.name === 'Numeric') return numeric(source.slice(node.from, node.to));
	if (node.name === 'Unary' && kids.length === 2 && (kids[0].name === 'Minus' || kids[0].name === 'Plus')) {
		const inner = measured(kids[1], source);
		return inner && scaled(inner, kids[0].name === 'Minus' ? -1 : 1);
	}
	if (node.name === 'Binary' && kids.length === 3 && (kids[1].name === 'Plus' || kids[1].name === 'Minus')) {
		const left = measured(kids[0], source);
		const right = measured(kids[2], source);
		return left && right && sum(left, scaled(right, kids[1].name === 'Minus' ? -1 : 1));
	}
	return null;
}

/** how the editor draws a length expression, or null when it is not a length Typst would read */
export function typstLengthOf(node: SyntaxNode, source: string): DrawnLength | null {
	const measure = measured(node, source);
	if (!measure) return null;
	if (measure.fr > 0) return { fill: true };
	return measure.share !== 0 ? { share: measure.share } : { em: measure.em };
}

/** typed text that is a length: one Typst reads as it stands, as the amount of a space */
export function isTypstLength(text: string): boolean {
	if (!text.trim() || /[\n;]/.test(text)) return false;
	const call = readTypstCall(`#v(${text})`);
	const args = call ? positionalArgs(call) : [];
	return call !== null && call.args.length === 1 && args.length === 1 && typstLengthOf(args[0].node, call.source) !== null;
}
