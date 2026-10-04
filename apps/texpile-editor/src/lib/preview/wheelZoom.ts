/** How much one ctrl/cmd wheel event zooms a preview. A trackpad pinch arrives as many small pixel
 *  deltas and a mouse notch as one large one, so the step follows the delta and a pinch tracks the
 *  fingers; the cap keeps a notch at one 10% step. */
export function wheelZoomFactor(e: Pick<WheelEvent, 'deltaY' | 'deltaMode'>): number {
	const px = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * 800 : e.deltaY;
	return Math.min(1.1, Math.max(1 / 1.1, Math.exp(-px / 100)));
}
