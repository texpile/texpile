import type { SyntaxNode } from '@lezer/common';
import { hasSyntaxError } from '$lib/languages/typst/knowledge/scan/syntax';
import {
	aloneWithLabel,
	calleeName,
	callEntry,
	children,
	equationInner,
	labelGapOf,
	namedKey,
	namedValue,
	noteSpans,
	standsFor,
	type TypstImport,
	type TypstSeg
} from '$lib/languages/typst/visual/core/document';

const GAPS = new Set(['Space', 'Comma', 'LineComment', 'BlockComment']);

function equationParts(call: SyntaxNode, src: string): { formula: SyntaxNode; name: string; lead: string; tail: string } | null {
	if (call.name !== 'FuncCall' || hasSyntaxError(call)) return null;
	const entry = callEntry(call, src);
	if (entry?.group !== 'math' || !entry.blockParam) return null;
	const name = calleeName(call.firstChild, src);
	const kids = children(call.lastChild!);
	const open = kids[0];
	const close = kids[kids.length - 1];
	if (!name || open?.name !== 'LeftParen' || close?.name !== 'RightParen' || open === close) return null;
	const items = kids.slice(1, -1).filter((k) => !GAPS.has(k.name));
	const formulas = items.filter((k) => k.name === 'Equation');
	const named = items.filter((k) => k.name === 'Named');
	if (formulas.length !== 1 || formulas.length + named.length !== items.length) return null;
	const block = named.find((k) => namedKey(k, src) === entry.blockParam);
	const given = block ? namedValue(block) : null;
	if (!given || src.slice(given.from, given.to) !== 'true') return null;
	const [formula] = formulas;
	return { formula, name, lead: src.slice(open.to, formula.from), tail: src.slice(formula.to, close.from) };
}

export function equationCallSeg(im: TypstImport, kids: SyntaxNode[], i: number): { seg: TypstSeg; next: number } | null {
	const src = im.src;
	const hash = kids[i];
	const call = kids[i + 1];
	const parts = equationParts(call, src);
	const alone = parts ? aloneWithLabel(kids, i + 2, src) : null;
	const inner = parts ? equationInner(parts.formula, src).trim() : '';
	if (!parts || !alone || !inner) return null;
	const label = alone.label ? src.slice(alone.label.from + 1, alone.label.to - 1) : null;
	const attrs = {
		label,
		labelGap: labelGapOf(src, call.to, alone.label),
		numbered: false,
		environment: null,
		lineLabels: [],
		typEquation: { name: parts.name, lead: parts.lead, tail: parts.tail }
	};
	const to = (alone.label ?? call).to;
	const equation = noteSpans(im.core.node('block_math', attrs, im.core.texts(inner)), standsFor(1, hash.from, to));
	return { seg: { blocks: [equation], from: hash.from, to }, next: alone.next };
}
