import { SPREAD_TOL } from './tolerances';
import type { Cal } from '../locate/locate.types';

// Does this split render reproduce a recompile? A straddling paragraph is spliced into two
// columns, so the question is not "does it still fit" but "did anything below either fragment
// have to move". Nothing did when the engine's \vsplit puts the break back on the line the
// page already broke at, both fragments keep their height, and the spill's first box still
// lands where \topskip put it -- the columns then hold exactly the content they held, with
// this paragraph's new words in it.
//
// Only a source-stamped split can be asked this: the searching tier recovers the break by
// trying cuts until the glyphs agree, so its split point is the daemon's answer rather than
// the page's, and comparing the two would be comparing a number with itself.
export function splitExact(cal: Cal, topSkip: number, s: { kA: number; aSpan: number; spillDelta: number; bH1: number }): boolean {
	if (cal.splitAt === undefined || !cal.spill || cal.approx) return false;
	if (s.kA !== cal.splitAt) return false;
	if (Math.abs(s.aSpan - (cal.bk - cal.b1)) > SPREAD_TOL) return false;
	if (Math.abs(s.spillDelta) > SPREAD_TOL) return false;
	// the receiving column seats its first baseline max(\topskip, height) below its top, so a
	// spill whose first line grew past \topskip starts lower than the one it replaces
	const was = cal.spill.h1;
	if (was === undefined) return false;
	return Math.abs(Math.max(topSkip, s.bH1) - Math.max(topSkip, was)) <= SPREAD_TOL;
}
