import type { DiagramArrow } from '$lib/draw/editor/figure/figureLanguage';
import { bracedIf, texText, typedText } from '../sourceText';
import type { CdArrowSpan } from './cdGrid.types';

const HEADS: Record<string, DiagramArrow['head']> = {
	hook: 'hook',
	"hook'": 'hook',
	'two heads': 'two heads',
	mapsto: 'mapsto',
	dash: 'dash',
	'no head': 'dash',
	Rightarrow: 'Rightarrow',
	equal: 'equal',
	equals: 'equal'
};
const LINES = ['dashed', 'dotted'];
const BEND = /^bend (left|right)\b/;
// the label's text, then `'` for the other side, then its own keys
const LABEL = /^"([\s\S]*)"\s*('?)\s*([\s\S]*)$/;

function isHead(i: string) {
	return i in HEADS;
}
function isLine(i: string) {
	return LINES.includes(i);
}
function isLabel(i: string) {
	return i.startsWith('"');
}

export function readArrow(arrow: CdArrowSpan): DiagramArrow {
	const { items } = arrow;
	const label = LABEL.exec(items.find(isLabel) ?? '');
	const keys = label?.[3].split(/\s*,\s*|\s+(?=description)/) ?? [];
	return {
		label: typedText(label?.[1] ?? ''),
		side: label?.[2] ? 'right' : keys.includes('description') ? 'on' : 'left',
		head: HEADS[items.find(isHead) ?? ''] ?? 'to',
		line: (items.find(isLine) as DiagramArrow['line']) ?? 'solid',
		bend: (BEND.exec(items.find((i) => BEND.test(i)) ?? '')?.[1] as 'left' | 'right') ?? 'none'
	};
}

/** the item `is` picks put to `value`: replaced where it is, else added last, or taken out for null */
function withItem(items: string[], is: (i: string) => boolean, value: string | null) {
	const k = items.findIndex(is);
	if (k < 0) return value === null ? items : [...items, value];
	return value === null ? items.filter((_, j) => j !== k) : items.map((i, j) => (j === k ? value : i));
}

function labelItem(old: string | undefined, label: string, side: DiagramArrow['side']) {
	if (!label) return null;
	const keys = (LABEL.exec(old ?? '')?.[3] ?? '').replace(/\bdescription\b/, '').trim();
	const text = bracedIf(texText(label, true), /["[\],=]/);
	return `"${text}"${side === 'right' ? "'" : ''}${side === 'on' ? ' description' : ''}${keys ? ` ${keys}` : ''}`;
}

export function arrowItems(arrow: CdArrowSpan, change: Partial<DiagramArrow>) {
	const now = readArrow(arrow);
	const next = { ...now, ...change };
	let items = arrow.items;
	if ('label' in change || 'side' in change) items = withItem(items, isLabel, labelItem(items.find(isLabel), next.label, next.side));
	if ('head' in change) items = withItem(items, isHead, next.head === 'to' ? null : next.head);
	if ('line' in change) items = withItem(items, isLine, next.line === 'solid' ? null : next.line);
	if ('bend' in change) {
		const angle = /=\s*(\S+)$/.exec(items.find((i) => BEND.test(i)) ?? '')?.[1];
		items = withItem(items, (i) => BEND.test(i), next.bend === 'none' ? null : `bend ${next.bend}${angle ? `=${angle}` : ''}`);
	}
	return items;
}
