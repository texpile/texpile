// tabular environments to table nodes: rows, cells, spans and the rules between rows
import { buildNode, collapseTextNodes, createDefaultContext, type PmNode } from '../../../builders';
import { isTableRule, resolveSpans } from './tableRules';
import { blockSpanOf, noteBlockSpan, type BlockSpan } from '$lib/editor/visual/sourceSpans';
import { argText, mandatoryArgs } from '../../walk/treeArgs';
import type { TreeEnvironment } from '../../walk/treeEnvironment';
import type { Stretch } from '../../walk/stretch';
import { chipOf, rawBlockOf, sliceOf, type TreeImport } from '../treeImport';
import { inlineOf } from '../inlineTree';
import { isBlankUnit, unitsIn, type Unit } from './tableShapes';

export { tableWrapperBlocks } from './tableWrapperTree';

const LONGTABLE_MARKERS = new Set(['endfirsthead', 'endhead', 'endfoot', 'endlastfoot']);

function trimBlank(units: Unit[]): Unit[] {
	let start = 0;
	let end = units.length;
	while (start < end && isBlankUnit(units[start])) start++;
	while (end > start && isBlankUnit(units[end - 1])) end--;
	return units.slice(start, end);
}

/** the stretches the units cover, split where a rule between rows was taken out */
function runsOf(units: Unit[]): { from: number; to: number }[] {
	const runs: { from: number; to: number }[] = [];
	for (const u of units) {
		const last = runs[runs.length - 1];
		if (last && last.to === u.from) last.to = u.to;
		else runs.push({ from: u.from, to: u.to });
	}
	return runs;
}

function spanNumber(im: TreeImport, text: string): number {
	const v = parseInt(text.trim(), 10);
	return Number.isFinite(v) && v > 0 ? v : 1;
}

/** a leading \multicolumn or \multirow (\multicolumn around \multirow for both), with what it spans and holds */
function unwrapSpans(
	im: TreeImport,
	units: Unit[]
): { colspan: number; rowspan: number; inner: Unit[]; parent: Stretch | null; mcAlign: string | null } {
	let colspan = 1;
	let rowspan = 1;
	let mcAlign: string | null = null;
	let inner = units;
	let parent: Stretch | null = null;
	function only(list: Unit[], name: string) {
		const meaningful = list.filter((u) => !isBlankUnit(u));
		return meaningful.length === 1 && meaningful[0].call?.name === name ? meaningful[0].call : null;
	}
	function textOf(call: NonNullable<Unit['call']>): void {
		const args = mandatoryArgs(call);
		if (args.length >= 3 && args[2].body) {
			parent = args[2].body;
			inner = unitsIn(im, args[2].body);
		}
	}
	const mc = only(units, 'multicolumn');
	const mr = mc ? null : only(units, 'multirow');
	if (mc) {
		const args = mandatoryArgs(mc);
		colspan = spanNumber(im, argText(im.src, args[0]));
		mcAlign = args[1] ? argText(im.src, args[1]) : null;
		textOf(mc);
		const nested = only(inner, 'multirow');
		if (nested) {
			rowspan = spanNumber(im, argText(im.src, mandatoryArgs(nested)[0]));
			textOf(nested);
		}
	} else if (mr) {
		rowspan = spanNumber(im, argText(im.src, mandatoryArgs(mr)[0]));
		textOf(mr);
	}
	return { colspan, rowspan, inner, parent, mcAlign };
}

/** `emptyAt`: where an empty cell's bytes would be, at the `&` or `\\` that ends it */
function cellOf(im: TreeImport, units: Unit[], body: Stretch, emptyAt?: number): PmNode {
	const { colspan, rowspan, inner, parent, mcAlign } = unwrapSpans(im, units);
	const pieces: Unit[][] = [[]];
	for (const u of inner) {
		if (u.call?.name === 'par') pieces.push([]);
		else pieces[pieces.length - 1].push(u);
	}
	const paragraphs: PmNode[] = [];
	for (const piece of pieces) {
		// blank units go before conversion: a \quad that makes real spaces is no incidental whitespace
		const kept = trimBlank(piece);
		if (!kept.length && paragraphs.length > 0) continue;
		const stretch = kept.length ? { parent: (parent ?? body).parent, from: kept[0].from, to: kept[kept.length - 1].to } : null;
		// a cell that is one brace group keeps it: siunitx's S column reads a braced cell as text, else as a number
		const wholeGroup = kept.length === 1 && !kept[0].call && kept[0].piece.kind === 'node' && kept[0].piece.node.name === 'Group';
		const content = wholeGroup
			? [chipOf(im, kept[0])]
			: collapseTextNodes(
					runsOf(kept).flatMap((run) =>
						inlineOf(im, { parent: (parent ?? body).parent, from: run.from, to: run.to }, createDefaultContext())
					)
				);
		if (!content.length && paragraphs.length > 0) continue;
		paragraphs.push(
			noteBlockSpan(buildNode('paragraph', null, content), stretch ? { srcFrom: stretch.from, srcTo: stretch.to, size: 1 } : null)
		);
	}
	const kept = paragraphs.length > 1 && paragraphs[0].content.size === 0 ? paragraphs.slice(1) : paragraphs;
	const own = trimBlank(units);
	const span: BlockSpan | null = own.length
		? { srcFrom: own[0].from, srcTo: own[own.length - 1].to, size: 1 }
		: typeof emptyAt === 'number'
			? { srcFrom: emptyAt, srcTo: emptyAt, size: 1 }
			: null;
	return noteBlockSpan(buildNode('table_cell', { colspan, rowspan, colwidth: null, mcAlign }, kept), span);
}

export function tableBlocks(im: TreeImport, env: TreeEnvironment): PmNode[] {
	const units = unitsIn(im, env.body);
	// a longtable with repeating header and footer markers is no grid
	if (env.name === 'longtable' && units.some((u) => u.call && LONGTABLE_MARKERS.has(u.call.name))) return [rawBlockOf(im, env)];
	const braced = env.args.filter((a) => a.present && a.kind === 'm');
	const tabularxWidth = braced.length >= 2 ? argText(im.src, braced[0]) : null;
	const colspec = braced.length ? argText(im.src, braced[braced.length - 1]) : null;
	const positionArg = env.args.find((a) => a.present && a.open === '[');
	const position = positionArg ? argText(im.src, positionArg) : null;

	const rows: PmNode[] = [];
	const rowSpans: (BlockSpan | null)[] = [];
	let cells: PmNode[] = [];
	let cell: Unit[] = [];
	let pendingRules = '';
	let rowTop = '';
	let rowStarted = false;
	function startRow() {
		if (rowStarted) return;
		rowStarted = true;
		rowTop = pendingRules;
		pendingRules = '';
	}
	function flushRow(rowBreakSuffix = '') {
		rows.push(buildNode('table_row', { topRules: rowTop, rowBreakSuffix }, cells.length > 0 ? cells : [cellOf(im, [], env.body)]));
		const placed = cells.map((c) => blockSpanOf(c)).filter((s): s is BlockSpan => !!s);
		rowSpans.push(
			placed.length > 0 && placed.length === cells.length
				? { srcFrom: Math.min(...placed.map((s) => s.srcFrom)), srcTo: Math.max(...placed.map((s) => s.srcTo)), size: 1 }
				: null
		);
		cells = [];
		rowTop = '';
		rowStarted = false;
	}
	for (const u of units) {
		if (u.piece.kind === 'word' && im.src[u.from] === '&') {
			startRow();
			cells.push(cellOf(im, cell, env.body, u.from));
			cell = [];
		} else if (u.call?.name === '\\') {
			startRow();
			cells.push(cellOf(im, cell, env.body, u.from));
			flushRow(sliceOf(im, { from: u.call.node.to, to: u.call.to }));
			cell = [];
		} else if (u.call && isTableRule(u.call.name)) pendingRules += sliceOf(im, u);
		// a strut before any cell content leads the row; in the first cell it compounded as a rule
		else if (!rowStarted && (u.call?.name === 'rule' || u.call?.name === 'hrule')) pendingRules += sliceOf(im, u);
		else {
			if (!isBlankUnit(u) && !(u.piece.kind === 'word' && sliceOf(im, u).trim() === '')) startRow();
			cell.push(u);
		}
	}
	if (!cell.every(isBlankUnit) || cells.length > 0) {
		if (cell.length > 0 || cells.length > 0) {
			startRow();
			cells.push(cellOf(im, cell, env.body));
			flushRow();
		}
	}
	if (rows.length === 0) rows.push(buildNode('table_row', null, [cellOf(im, [], env.body)]));
	const resolved = resolveSpans(rows);
	if (resolved.length === rows.length) resolved.forEach((row, i) => noteBlockSpan(row, rowSpans[i]));
	return [buildNode('table', { env: env.name, colspec, tabularxWidth, position, bottomRules: pendingRules }, resolved)];
}
