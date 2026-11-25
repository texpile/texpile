import { bulletItems, orderedRuns, printedValue, type ItemLabels, type NumberStyle } from '$lib/languages/latex/visual/core';
import type { Node as PMNode } from 'prosemirror-model';

const KERNEL_LABELS = ['\\arabic*.', '(\\alph*)', '\\roman*.', '\\Alph*.'];
const STARRED = /\\(arabic|alph|Alph|roman|Roman)\*/;
const SHORT = /[1aAiI]/;
const SHORT_STYLE: Record<string, NumberStyle> = { 1: 'arabic', a: 'alph', A: 'Alph', i: 'roman', I: 'Roman' };

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
	return printed.replace(/\\[a-zA-Z@]+\*?/g, '').replace(/[{}]/g, '');
}

const KERNEL_BULLETS = ['\u2022', '\u2013', '\u2217', '\u00B7'];
const BULLET_COMMANDS: Record<string, string> = {
	textbullet: '\u2022',
	bullet: '\u2022',
	ast: '\u2217',
	cdot: '\u00B7',
	textendash: '\u2013'
};

/** an enumitem label that is plain text, as the item prints it */
function printedBullet(template: string): string {
	return template
		.replace(/---/g, '\u2014')
		.replace(/--/g, '\u2013')
		.replace(/\\([a-zA-Z]+)\s*/g, (_, name: string) => BULLET_COMMANDS[name] ?? '')
		.replace(/[{}$]/g, '');
}

function bulletLabels(doc: PMNode, out: ItemLabels): void {
	for (const { node, pos, depth } of bulletItems(doc)) {
		const label = optionsOf(node.attrs.envArgs).label;
		out.set(pos, (label !== null && printedBullet(label)) || KERNEL_BULLETS[Math.min(depth, 3)]);
	}
}

export function enumerateLabels(doc: PMNode): ItemLabels {
	const out: ItemLabels = new Map();
	bulletLabels(doc, out);
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
