// the speed of a drag past the pane's edge (G6, A2)

/** px/s of the DOM editor's autoscroll at 10, 40, 100 and 200 px past the bottom edge (P0, plain-tall.tex) */
const P0_SPEEDS: readonly (readonly [number, number])[] = [
	[10, 1870],
	[40, 3672],
	[100, 7282],
	[200, 12695]
];
const P0_SLOPE_BELOW_10 = 60;
const RAMP_MS = 1500;
const FULL_SCREEN_PAST_PX = 60;

/** Chromium's speed for `overshoot` px past the edge, which the held drag reaches after RAMP_MS */
export function p0Speed(overshoot: number): number {
	const past = Math.max(0, overshoot);
	if (past <= P0_SPEEDS[0][0]) return P0_SPEEDS[0][1] - (P0_SPEEDS[0][0] - past) * P0_SLOPE_BELOW_10;
	for (let i = 1; i < P0_SPEEDS.length; i++) {
		const [x1, y1] = P0_SPEEDS[i];
		if (past > x1) continue;
		const [x0, y0] = P0_SPEEDS[i - 1];
		return y0 + ((y1 - y0) * (past - x0)) / (x1 - x0);
	}
	const [x1, y1] = P0_SPEEDS[P0_SPEEDS.length - 1];
	const [x0, y0] = P0_SPEEDS[P0_SPEEDS.length - 2];
	return y1 + ((y1 - y0) * (past - x1)) / (x1 - x0);
}

/**
 * px/s for a pointer `overshoot` px past the edge (negative inside the band one line deep) held for `heldMs`:
 * two lines a second at the band, one screen a second at 60 px past, P0's speed after 1.5 s
 */
export function autoscrollSpeed(overshoot: number, heldMs: number, screenPx = 720, linePx = 24): number {
	if (overshoot <= -linePx) return 0;
	const bandSpeed = 2 * linePx;
	const base =
		overshoot <= 0 ? bandSpeed : Math.min(p0Speed(overshoot), bandSpeed + ((screenPx - bandSpeed) * overshoot) / FULL_SCREEN_PAST_PX);
	const ramp = Math.min(1, Math.max(0, heldMs) / RAMP_MS) ** 2;
	return base + (Math.max(base, p0Speed(overshoot)) - base) * ramp;
}
