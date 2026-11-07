// what an enumerate's items print, as LaTeX counts them: each list from 1, enumii in (a), enumitem's label, start and
// resume, and an \item[label] its own label and no step
import { orderedRuns, printedValue, type ItemLabels, type NumberStyle } from '$lib/languages/latex/visual/core';
import type { Node as PMNode } from 'prosemirror-model';

/** \labelenumi to \labelenumiv */
const KERNEL_LABELS = ['\\arabic*.', '(\\alph*)', '\\roman*.', '\\Alph*.'];
const STARRED = /\\(arabic|alph|Alph|roman|Roman)\*/;
// the enumerate package's [(a)]: the first of these letters stands for the count
const SHORT = /[1aAiI]/;
const SHORT_STYLE: Record<string, NumberStyle> = { 1: 'arabic', a: 'alph', A: 'Alph', i: 'roman', I: 'Roman' };

/** short: the label is the enumerate package's [(a)] */
type ListOptions = { label: string | null; short: boolean; start: number | null; resume: boolean };

function optionsOf(envArgs: unknown): ListOptions {
	const inner = typeof envArgs === 'string' ? /^\s*\[([\s\S]*)\]\s*$/.exec(envArgs)?.[1] : undefined;
	const none: ListOptions = { label: null, short: false, start: null, resume: false };
	if (inner === undefined) return none;
	if (!inner.includes('=') && !/\bresume\b/.test(inner)) return SHORT.test(inner) ? { ...none, label: inner.trim(), short: true } : none;
	const label = /(?:^|,)\s*label\s*=\s*(\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}|[^,]*)/.exec(inner)?.[1].trim() ?? null;
	const start = /(?:^|,)\s*start\s*=\s*(-?\d+)/.exec(inner)?.[1];
	return {
		label: label?.replace(/^\{([\s\S]*)\}$/, '$1') ?? null,
		short: false,
		start: start ? Number(start) : null,
		resume: /(?:^|,)\s*resume\*?\s*(?:,|$)/.test(inner)
	};
}

function printedLabel(template: string, value: number, enumerateShort: boolean): string {
	const printed = STARRED.test(template)
		? template.replace(STARRED, (_, style: NumberStyle) => printedValue(value, style))
		: enumerateShort
			? template.replace(SHORT, (c) => printedValue(value, SHORT_STYLE[c]))
			: `${value}.`;
	// the label's font commands (\textbf{...}, \upshape) print no text of their own
	return printed.replace(/\\[a-zA-Z@]+\*?/g, '').replace(/[{}]/g, '');
}

export function enumerateLabels(doc: PMNode): ItemLabels {
	const out: ItemLabels = new Map();
	const last: number[] = [];
	for (const run of orderedRuns(doc, (a, b) => a.attrs.envKey === b.attrs.envKey)) {
		const options = optionsOf(run.items[0].node.attrs.envArgs);
		const template = options.label ?? KERNEL_LABELS[Math.min(run.depth, 3)];
		let value = options.resume ? (last[run.depth] ?? 0) : (options.start ?? 1) - 1;
		for (const item of run.items) {
			if (typeof item.node.attrs.itemLabel === 'string') {
				out.set(item.pos, '');
				continue;
			}
			value += 1;
			out.set(item.pos, printedLabel(template, value, options.short));
		}
		last[run.depth] = value;
	}
	return out;
}
