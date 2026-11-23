// every frame's painted device pixels while a move runs, read off the probe right after the frame
import type { Page } from '@playwright/test';
import { inCanvas } from '../canvasPage';

type PaintWindow = Window & { framePaints?: number[]; framePaintsOn?: boolean };

export function recordFramePaints(page: Page): Promise<void> {
	return inCanvas(page, ({ probe }) => {
		const w = window as PaintWindow;
		w.framePaints = [];
		w.framePaintsOn = true;
		let seen = probe.frameStats().frames;
		const tick = (): void => {
			if (!w.framePaintsOn) return;
			const channel = new MessageChannel();
			channel.port1.onmessage = () => {
				const stats = probe.frameStats();
				if (stats.frames !== seen) w.framePaints!.push(stats.lastPaintedPx);
				seen = stats.frames;
			};
			channel.port2.postMessage(null);
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	});
}

export function stopFramePaints(page: Page): Promise<number[]> {
	return page.evaluate(() => {
		const w = window as PaintWindow;
		w.framePaintsOn = false;
		return w.framePaints ?? [];
	});
}
