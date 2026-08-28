/* eslint-disable @typescript-eslint/no-explicit-any */
import type { LocateContext } from './locate.types';

// One calibration per (text, width) for the duration of a single locate.
//
// Every tier reproduces the unedited paragraph with the daemon before it will believe a
// band, and each tier asked separately: the source tier and the forward tier calibrate the
// same text at the same width, and the glyph tier's first variant is that same pair again.
// Each ask is an IPC round trip to the warm engine, so the repeats were pure latency --
// enough that adding a tier in front measurably slowed the fixtures it did not win.
//
// Scoped to the call, not the session: the daemon's answer depends on engine state the
// compile can change under us (counters, float set, catcodes), and a locate is short.
export function memoizeTypesets(ctx: LocateContext): LocateContext {
	const seen = new Map<string, Promise<any>>();
	return {
		...ctx,
		typesetParagraph(body) {
			const key = `${body.hsize ?? 0}:${body.text}`;
			let p = seen.get(key);
			if (!p) {
				p = ctx.typesetParagraph(body);
				seen.set(key, p);
			}
			return p;
		}
	};
}
