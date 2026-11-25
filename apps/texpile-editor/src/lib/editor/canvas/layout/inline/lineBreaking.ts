// where a flow's lines end: TeX's passes over the items of a held textblock, the browser's first fit for the others
import { breakLines, type LineItem } from '../linebreak/knuthPlass';
import type { BreakProfile } from './breakProfiles';
import type { BreakSite, InlineItems } from './inlineItems';
import type { KeptLines } from './keptBreaks';

export type LineWidths = { readonly first: number; readonly rest: number };
/** item indexes each line ends at, the closing forced break included */
export type ChosenLines = { readonly items: InlineItems; readonly breaks: readonly number[]; readonly sites: readonly BreakSite[] };

export type LineBreakRequest = {
	readonly profile: BreakProfile;
	readonly widths: LineWidths;
	readonly fontSize: number;
	/** false where white-space keeps every line whole (pre, nowrap) */
	readonly wraps: boolean;
	/** overflow-wrap lets a word wider than the line split anywhere */
	readonly splitsLongWords: boolean;
	readonly kept?: KeptLines;
	/** a tab's advance at x from the content box's start edge; the first line starts at the indent */
	readonly tabAdvance: (x: number) => number;
	readonly indent: number;
};

/** what first fit needs to size a tab box: where its line starts and how far the next stop is */
type TabStops = { readonly boxes: ReadonlySet<number>; readonly advance: (x: number) => number; readonly firstStart: number };

// layout rounds to 1/64 px; this keeps a line that measures exactly full from spilling
export const LINE_FIT_SLACK = 0.25;
const FIT_ROUNDING = 1e-6;
// TeX's own order: no hyphens at \pretolerance, hyphens at \tolerance, then whatever fits, with LaTeX's \sloppy
// emergency stretch so that text with few spaces (Thai, say) still ranks its lines by how short they fall
const JUSTIFIED_PASSES = [
	{ tolerance: 100, hyphenate: false, sloppy: false },
	{ tolerance: 200, hyphenate: true, sloppy: false },
	{ tolerance: Infinity, hyphenate: true, sloppy: true }
];
// a ragged edge hides uneven spaces, so nothing is gained by splitting words for it
const RAGGED_PASSES = [{ tolerance: Infinity, hyphenate: false, sloppy: true }];
const EMERGENCY_STRETCH_EMS = 3;

export function isForcedBreak(item: LineItem): boolean {
	return item.kind === 'penalty' && item.cost === -Infinity;
}

function sameSite(a: BreakSite, b: BreakSite): boolean {
	if (a.from !== b.from || a.to !== b.to || a.kind !== b.kind) return false;
	if (!a.inside || !b.inside) return a.inside === b.inside;
	return a.inside.key === b.inside.key && a.inside.from === b.inside.from && a.inside.to === b.inside.to;
}

// the items the kept breaks sit on now, up to the first one the paragraph no longer offers (a word held whole, say)
function keptItems(built: InlineItems, kept: KeptLines): number[] {
	const offered = [...built.sites];
	const items: number[] = [];
	let next = 0;
	for (const site of kept.sites) {
		if (site.to > kept.unchangedTo) break;
		while (next < offered.length && offered[next][1].from < site.from) next++;
		const [item, now] = offered[next] ?? [];
		if (item === undefined || !sameSite(now, site)) break;
		items.push(item);
	}
	return items;
}

function knuthPlassBreaks(built: InlineItems, request: LineBreakRequest, first: number, rest: number): number[] | null {
	const { profile, kept } = request;
	const fixed = kept && kept.width === request.widths.rest ? keptItems(built, kept) : [];
	const emergencyStretch = EMERGENCY_STRETCH_EMS * request.fontSize;
	// with nothing that fits after the kept lines, the whole paragraph is tried
	for (const lines of fixed.length > 0 ? [fixed, []] : [[]]) {
		for (const { tolerance, hyphenate, sloppy } of profile.justified ? JUSTIFIED_PASSES : RAGGED_PASSES) {
			const pass = {
				tolerance,
				hyphenate: hyphenate && profile.hyphenate,
				firstLineWidth: first,
				lineWidth: rest,
				emergencyStretch: sloppy ? emergencyStretch : 0
			};
			const breaks = breakLines(built.items, pass, lines.at(-1) ?? -1);
			if (breaks) return [...lines, ...breaks];
		}
	}
	return null;
}

/** first fit: each line takes what fits; a word that fits no line runs past the edge, as overflow-wrap normal leaves it */
export function greedyBreaks(items: readonly LineItem[], first: number, rest: number, wraps = true, tabs?: TabStops): number[] {
	const breaks: number[] = [];
	let target = first;
	let start = tabs?.firstStart ?? 0;
	let width = 0;
	let candidate = -1;
	let atLineStart = true;
	function endLineAt(index: number): void {
		breaks.push(index);
		target = rest;
		start = 0;
		width = 0;
		candidate = -1;
		atLineStart = true;
	}
	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		if (isForcedBreak(item)) {
			endLineAt(i);
			continue;
		}
		// glue and penalties right after a break are dropped
		if (atLineStart && item.kind !== 'box') continue;
		const feasible = wraps && ((item.kind === 'glue' && items[i - 1]?.kind === 'box') || (item.kind === 'penalty' && item.cost < Infinity));
		if (feasible) {
			const lineWidth = width + (item.kind === 'penalty' ? item.width : 0);
			if (lineWidth <= target) candidate = i;
			else {
				const at = candidate >= 0 ? candidate : i;
				endLineAt(at);
				i = at;
				continue;
			}
		}
		if (item.kind === 'box') {
			atLineStart = false;
			const boxWidth = tabs?.boxes.has(i) ? tabs.advance(start + width) : item.width;
			if (width + boxWidth > target && candidate >= 0) {
				const at = candidate;
				endLineAt(at);
				i = at;
				continue;
			}
			width += boxWidth;
			continue;
		}
		if (item.kind !== 'penalty') width += item.width;
	}
	return breaks;
}

export function chooseLines(build: (splitWiderThan: number) => InlineItems, request: LineBreakRequest): ChosenLines {
	// a shrink-to-fit width took the slack on, and taking it off again can lose the float's last bit
	const first = request.widths.first - LINE_FIT_SLACK + FIT_ROUNDING;
	const rest = request.widths.rest - LINE_FIT_SLACK + FIT_ROUNDING;
	let built = build(Infinity);
	// a word no line can hold is offered a split at any of its characters, the browser's own way out
	if (request.splitsLongWords && built.items.some((item) => item.kind === 'box' && item.width > Math.min(first, rest)))
		built = build(Math.min(first, rest));
	let breaks = request.profile.breaker === 'knuthPlass' && request.wraps ? knuthPlassBreaks(built, request, first, rest) : null;
	breaks ??= greedyBreaks(built.items, first, rest, request.wraps, {
		boxes: built.tabs,
		advance: request.tabAdvance,
		firstStart: request.indent
	});
	return { items: built, breaks, sites: breaks.flatMap((item) => built.sites.get(item) ?? []) };
}
