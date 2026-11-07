// tabular environments to table nodes: rows, cells, spans and the rules between rows
import {
	argText,
	blockSpanOf,
	bodyOf,
	createDefaultContext,
	isBlankUnit,
	isScopedSwitch,
	mandatoryArgs,
	noteBlockSpan,
	sliceOf,
	type BlockSpan,
	type PmNode,
	type Stretch,
	type TreeEnvironment,
	type TreeImport,
	type Unit
} from '$lib/languages/latex/visual/core/document';
import { isRowEnd, isTableRule, resolveSpans } from './tableRules';
import type { SyntaxNode } from '@lezer/common';
import { commonFacts } from '$lib/languages/latex/knowledge/commands/commandFacts';
import { isLongtableMarker } from '../longtable/longtableMarkers';
import { captionCallsIn, captionedLongtable, endedBy, type CaptionCalls, type CaptionRow } from '../longtable/longtableTree';

export { tableWrapperBlocks } from './tableWrapperTree';

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
			inner = im.core.unitsIn(args[2].body);
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

/** the one brace group a cell is; a group led by a switch (`{\bf x}`) reads as styled text */
function bracedGroupOf(im: TreeImport, units: Unit[]): SyntaxNode | null {
	if (units.length !== 1 || units[0].call || units[0].piece.kind !== 'node' || units[0].piece.node.name !== 'Group') return null;
	const group = units[0].piece.node;
	const lead = im.core.unitsIn(bodyOf(group)).find((u) => !isBlankUnit(u));
	return lead?.call && isScopedSwitch(lead.call.name) ? null : group;
}

// a font switch reads as styled text; one of these the editor has no look for
const CELL_WIDE = new Set(['align', 'size']);

function isCellWideSwitch(u: Unit): boolean {
	const declares = u.call ? commonFacts(u.call.name).declares : undefined;
	return !!declares && CELL_WIDE.has(declares) && !u.call!.args.some((a) => a.present);
}

/** a cell's content past the switches it opens with (\centering \scriptsize), which apply to all of it */
function afterSwitches(units: Unit[]): Unit[] {
	let i = 0;
	while (i < units.length && (isBlankUnit(units[i]) || isCellWideSwitch(units[i]))) i++;
	return units.slice(i);
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
	let braced = false;
	let lead: string | null = null;
	for (const piece of pieces) {
		// blank units go before conversion: a \quad that makes real spaces is no incidental whitespace
		let kept = trimBlank(piece);
		if (!kept.length && paragraphs.length > 0) continue;
		let within = parent ?? body;
		// a cell that is one brace group keeps it: siunitx's S column reads a braced cell as text, else as a number
		const group = pieces.length === 1 ? bracedGroupOf(im, kept) : null;
		if (group) {
			braced = true;
			within = bodyOf(group);
			kept = trimBlank(im.core.unitsIn(within));
		}
		if (!paragraphs.length) {
			const rest = afterSwitches(kept);
			if (rest.length && rest.length < kept.length) {
				lead = im.src.slice(kept[0].from, rest[0].from);
				kept = rest;
			}
		}
		const stretch = kept.length ? { parent: within.parent, from: kept[0].from, to: kept[kept.length - 1].to } : null;
		const content = im.core.collapse(
			runsOf(kept).flatMap((run) => im.core.inline({ parent: within.parent, from: run.from, to: run.to }, createDefaultContext()))
		);
		if (!content.length && paragraphs.length > 0) continue;
		paragraphs.push(
			noteBlockSpan(im.core.node('paragraph', null, content), stretch ? { srcFrom: stretch.from, srcTo: stretch.to, size: 1 } : null)
		);
	}
	const kept = paragraphs.length > 1 && paragraphs[0].content.size === 0 ? paragraphs.slice(1) : paragraphs;
	const own = trimBlank(units);
	const span: BlockSpan | null = own.length
		? { srcFrom: own[0].from, srcTo: own[own.length - 1].to, size: 1 }
		: typeof emptyAt === 'number'
			? { srcFrom: emptyAt, srcTo: emptyAt, size: 1 }
			: null;
	return noteBlockSpan(im.core.node('table_cell', { colspan, rowspan, colwidth: null, mcAlign, braced, lead }, kept), span);
}

export function tableBlocks(im: TreeImport, env: TreeEnvironment): PmNode[] {
	const units = im.core.unitsIn(env.body);
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
	const rowEnds = new Map<number, string>();
	let captionRow: CaptionRow | null = null;
	function startRow() {
		if (rowStarted) return;
		rowStarted = true;
		rowTop = pendingRules;
		pendingRules = '';
	}
	function flushRow(rowBreak?: string, rowBreakSuffix = '', unbroken = false) {
		rows.push(
			im.core.node(
				'table_row',
				{ topRules: rowTop, rowBreak, rowBreakSuffix, unbroken },
				cells.length > 0 ? cells : [cellOf(im, [], env.body)]
			)
		);
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
		} else if (u.call && isRowEnd(u.call.name)) {
			startRow();
			const suffix = sliceOf(im, { from: u.call.node.to, to: u.call.to });
			const caption: CaptionCalls | null = env.name === 'longtable' && !captionRow && cells.length === 0 ? captionCallsIn(im, cell) : null;
			if (caption) {
				captionRow = { ...caption, top: rowTop, suffix, at: rows.length, end: '' };
				rowTop = '';
				rowStarted = false;
			} else {
				cells.push(cellOf(im, cell, env.body, u.from));
				flushRow(sliceOf(im, u.call.node), suffix);
			}
			cell = [];
		} else if (env.name === 'longtable' && u.call && isLongtableMarker(u.call.name)) {
			// a marker ends the row before it, which then needs no row break
			if (rowStarted || !cell.every(isBlankUnit)) {
				startRow();
				cells.push(cellOf(im, cell, env.body));
				flushRow(undefined, '', true);
				cell = [];
			}
			const afterCaption = !!captionRow && captionRow.at === rows.length;
			if (afterCaption) captionRow!.end = endedBy(captionRow!.end, pendingRules, u.call.name);
			else if (rows.length > 0) rowEnds.set(rows.length - 1, endedBy(rowEnds.get(rows.length - 1) ?? '', pendingRules, u.call.name));
			else return [im.core.raw(env)];
			pendingRules = '';
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
	if (rows.length === 0) rows.push(im.core.node('table_row', null, [cellOf(im, [], env.body)]));
	const ended = rows.map((row, i) => {
		const end = rowEnds.get(i);
		return end ? row.type.create({ ...row.attrs, rowEnd: end }, row.content) : row;
	});
	const resolved = resolveSpans(im, ended);
	if (resolved.length === rows.length) resolved.forEach((row, i) => noteBlockSpan(row, rowSpans[i]));
	const table = im.core.node('table', { env: env.name, colspec, tabularxWidth, position, bottomRules: pendingRules }, resolved);
	return [captionRow ? captionedLongtable(im, env, captionRow, table) : table];
}
