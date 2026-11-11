// where the blocks of a written document landed, and the source map made of them
import { lazyMap, type Segment, type SourceMap } from '$lib/editor/visual/sourceSpans';
import type { Placed } from './blockAssemblyUtils';

function cut(s: Segment, len: number): Segment {
	if (s.srcTo <= len) return s;
	const pmTo = s.kind === 'text' ? s.pmFrom + Math.max(0, len - s.srcFrom) : s.pmTo;
	return { pmFrom: s.pmFrom, pmTo, srcFrom: Math.min(s.srcFrom, len), srcTo: len, kind: s.kind };
}

function moved(s: Segment, lead: number): Segment {
	if (lead === 0) return s;
	if (s.srcFrom >= lead) return { ...s, srcFrom: s.srcFrom - lead, srcTo: s.srcTo - lead };
	// the run began inside the trimmed lead
	const pmFrom = s.kind === 'text' ? s.pmFrom + Math.min(lead, s.srcTo) - s.srcFrom : s.pmFrom;
	return { ...s, pmFrom, srcFrom: 0, srcTo: Math.max(0, s.srcTo - lead) };
}

/** A block's runs and inner blocks are placed when the map is read: typing reads no map, and placing every block
 *  after the edit was 5 ms of each key in a 140-page file */
export function createLandedRuns() {
	const blocks: Segment[] = [];
	const landed: (() => Placed)[] = [];
	// where blocks[b]'s runs are cut: `cutsBefore` while the output is written, `cutsAfter` once its lead is trimmed
	const cutsBefore: (number | undefined)[] = [];
	const cutsAfter: (number | undefined)[] = [];
	let cuts = cutsBefore;
	let lead = 0;

	return {
		land(block: Segment, runs: () => Placed): void {
			blocks.push(block);
			landed.push(runs);
		},
		/** nothing recorded points past `len`, and a text run loses as many characters as bytes. Blocks land in
		 *  output order, so only the last ones can reach past a cut */
		cutTo(len: number): void {
			for (let b = blocks.length - 1; b >= 0 && blocks[b].srcTo > len; b--) {
				blocks[b] = cut(blocks[b], len);
				cuts[b] = Math.min(cuts[b] ?? len, len);
			}
		},
		/** the output lost `count` characters of white space at its start: the runs move with it, the inner blocks stay */
		leadTrimmed(count: number): void {
			lead = count;
			cuts = cutsAfter;
			if (count > 0) for (let b = 0; b < blocks.length; b++) blocks[b] = moved(blocks[b], count);
		},
		// runs land block by block in position order, so no sort is needed
		map(): SourceMap {
			return lazyMap(() => {
				const leaves: Segment[] = [];
				const inner: Segment[] = [];
				for (let b = 0; b < landed.length; b++) {
					const placed = landed[b]();
					const before = cutsBefore[b] ?? Infinity;
					const after = cutsAfter[b] ?? Infinity;
					for (const s of placed.leaves) {
						const run = cut(moved(cut(s, before), lead), after);
						if (run.srcTo > run.srcFrom && run.pmTo > run.pmFrom) leaves.push(run);
					}
					for (const s of placed.inner) {
						const within = cut(cut(s, before), after);
						if (within.pmTo > within.pmFrom) inner.push(within);
					}
				}
				return { leaves, blocks: blocks.filter((s) => s.srcTo > s.srcFrom), inner };
			});
		}
	};
}
