// the boxes a decoration's fill takes on a line: one per run under it, as the DOM editor drew each run's own inline box
import type { DecorationReach } from '../decorations/reachRule';
import type { LineBox } from '../contracts/layoutTypes';
import type { LayoutStyle, RunStyle } from '../contracts/styleTypes';
import { runBaselineOffset, usedLineHeight } from '../layout/inline/lineBoxes';
import type { FontMetricsReader } from '../layout/text/fontMetrics';

export type FillBand = { start: number; end: number; y: number; height: number };

/** the run's content area (reach text) or that area grown to the run's own line height (reach line), from the line's top */
export function runBand(
	run: RunStyle,
	line: LineBox,
	block: LayoutStyle,
	metrics: FontMetricsReader,
	reach: DecorationReach
): { y: number; height: number } {
	const own = metrics(run.fontString);
	const top = line.baseline + runBaselineOffset(run, block, metrics) - own.ascent;
	const area = own.ascent + own.descent;
	if (reach === 'text') return { y: top, height: area };
	const used = usedLineHeight(run.lineHeight ?? 'normal', run.font.sizePx, own.ascent, own.descent);
	return { y: top - (used - area) / 2, height: used };
}

/** [x0, x1] of each span cut where the runs under it change, each piece in its run's band; a gap no run covers takes the line's */
export function bandsUnder(
	line: LineBox,
	spans: readonly (readonly [number, number])[],
	bandOf: (run: RunStyle) => { y: number; height: number },
	fallback: { y: number; height: number }
): FillBand[] {
	const runs = line.fragments.filter((fragment) => fragment.kind === 'text' || fragment.kind === 'hyphen').sort((a, b) => a.x - b.x);
	return spans.flatMap(([start, end]) => {
		const pieces: FillBand[] = [];
		function add(piece: FillBand): void {
			const last = pieces.at(-1);
			if (last && Math.abs(last.end - piece.start) < 0.01 && last.y === piece.y && last.height === piece.height) last.end = piece.end;
			else pieces.push(piece);
		}
		let at = start;
		for (const fragment of runs) {
			const from = Math.max(at, fragment.x);
			const to = Math.min(end, fragment.x + fragment.width);
			if (to <= from) continue;
			if (from > at) add({ start: at, end: from, ...fallback });
			add({ start: from, end: to, ...bandOf(fragment.run) });
			at = to;
		}
		if (end > at) add({ start: at, end, ...fallback });
		return pieces;
	});
}
