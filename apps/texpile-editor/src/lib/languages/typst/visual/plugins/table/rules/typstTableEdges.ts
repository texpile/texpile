// the lines Typst prints around each cell of a table: its stroke, the lines written between the rows, and its align
import type { Node } from 'prosemirror-model';
import { TableMap } from 'prosemirror-tables';
import {
	heavierRule,
	horizontalAlignment,
	type CellAlign,
	type CellEdges,
	type RuleWeight,
	type TableLook
} from '$lib/languages/typst/visual/core';

function namedValue(args: readonly string[], name: string): string | null {
	for (const arg of args) {
		const found = new RegExp(`^\\s*${name}\\s*:\\s*([^]*?),?\\s*$`).exec(arg);
		if (found) return found[1].trim();
	}
	return null;
}

function strings(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

// every edge carries the table's stroke unless it says none. A stroke by side or by function counts as none: the tables
// that write one do it to print fewer lines, and which ones is theirs to compute
function strokesEveryEdge(args: readonly string[]): boolean {
	const stroke = namedValue(args, 'stroke');
	return stroke === null || !(stroke === 'none' || stroke.startsWith('(') || stroke.includes('=>'));
}

function weightOf(stroke: string | null): RuleWeight | null {
	if (stroke === null) return 'light';
	if (stroke === 'none') return null;
	const points = /([\d.]+)\s*pt/.exec(stroke);
	return points && Number(points[1]) >= 1.5 ? 'heavy' : 'light';
}

function numberIn(args: string, name: string): number | null {
	const found = new RegExp(`\\b${name}\\s*:\\s*(\\d+)`).exec(args);
	return found ? Number(found[1]) : null;
}

/** `across` after what stands between two rows is drawn over it: a table.hline with its stroke and reach, or a package's rule by its name */
export function withRule(source: string, across: readonly (RuleWeight | null)[]): (RuleWeight | null)[] {
	const call = /^#?([A-Za-z_][\w.-]*)\s*\(([^]*)\)\s*$/.exec(source.trim());
	if (!call) return [...across];
	const [, name, args] = call;
	if (!/(^|\.)hline$/.test(name)) {
		const weight: RuleWeight = /top|bottom|heavy/i.test(name) ? 'heavy' : 'light';
		return across.map((own) => heavierRule(own, weight));
	}
	const stroke = /\bstroke\s*:\s*([^,]+)/.exec(args);
	const weight = weightOf(stroke ? stroke[1].trim() : null);
	const start = numberIn(args, 'start') ?? 0;
	const end = numberIn(args, 'end') ?? across.length;
	return across.map((own, col) => (col >= start && col < end ? weight : own));
}

function sideOf(alignment: string): CellAlign {
	const side = horizontalAlignment(alignment);
	return side === 'center' ? 'center' : side === 'right' || side === 'end' ? 'right' : 'left';
}

// a table that says nothing takes the alignment around it: a figure centers what it holds
function columnSides(align: unknown, columns: number, inFigure: boolean): CellAlign[] {
	const value = typeof align === 'string' ? align.trim() : '';
	const unsaid: CellAlign = inFigure ? 'center' : 'left';
	const each = value.startsWith('(') ? value.slice(1, -1).split(',').map(sideOf) : [];
	return Array.from({ length: columns }, (_, col) => {
		if (!value) return unsaid;
		return value.startsWith('(') ? (each[col] ?? unsaid) : sideOf(value);
	});
}

function typstCellEdges(table: Node, inFigure: boolean): Map<number, CellEdges> {
	const map = TableMap.get(table);
	const every = strokesEveryEdge(strings(table.attrs.typArgs));
	const sides = columnSides(table.attrs.typAlign, map.width, inFigure);
	const lines = Array.from({ length: map.height + 1 }, (_, row) => {
		const plain = Array.from({ length: map.width }, (): RuleWeight | null => (every ? 'light' : null));
		const rules = row < table.childCount ? strings(table.child(row).attrs.typRules) : strings(table.attrs.typBottomRules);
		return rules.reduce((across, rule) => withRule(rule, across), plain);
	});
	const edges = new Map<number, CellEdges>();
	for (const at of new Set(map.map)) {
		const rect = map.findCell(at);
		const own = namedValue(strings(table.nodeAt(at)?.attrs.typCellArgs), 'align');
		let [top, bottom]: (RuleWeight | null)[] = [null, null];
		for (let col = rect.left; col < rect.right; col++) {
			top = heavierRule(top, lines[rect.top][col]);
			bottom = heavierRule(bottom, lines[rect.bottom][col]);
		}
		edges.set(at, { top, bottom, left: every, right: every, align: own ? sideOf(own) : sides[rect.left] });
	}
	return edges;
}

// fr and percent columns share out the width, any other table is as wide as its cells
function fillsWidth(table: Node): boolean {
	return /fr\b|%/.test(String(table.attrs.colspec ?? ''));
}

export const typstTableLook: TableLook = { edgesOf: typstCellEdges, fillsWidth };
