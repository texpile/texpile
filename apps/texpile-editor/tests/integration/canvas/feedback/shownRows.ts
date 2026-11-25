// what the pane shows of the canvas editor, every frame: the file, the title fields over it, the comment cards beside it
// and each visible line's text and client top
import type { Page } from '@playwright/test';
import type { CanvasProbe } from '$lib/editor/canvas';

/** ink: the content rows' sampled pixels that stand out from their ground, when asked for */
export type ShownRows = { path: string; rows: [text: string, top: number][]; ink?: number };
type RowsWindow = Window & { __canvasProbe?: CanvasProbe; shownRows?: ShownRows[]; shownRowsOn?: boolean };

/** from now, each state the frames leave on screen, read right after the frame */
export function recordShownRows(page: Page, options: { ink?: boolean } = {}): Promise<void> {
	return page.evaluate((withInk) => {
		const w = window as RowsWindow;
		w.shownRows = [];
		w.shownRowsOn = true;
		let last = '';
		const shownIn = (selector: string, name: string): [string, number][] =>
			[...document.querySelectorAll<HTMLElement>(selector)]
				.filter((field) => {
					const pane = field.closest('.overflow-auto')?.getBoundingClientRect();
					const box = field.getBoundingClientRect();
					return getComputedStyle(field).visibility !== 'hidden' && !!pane && box.bottom > pane.top && box.top < pane.bottom;
				})
				.map((field) => [`${name} ${field.textContent?.trim()}`, field.getBoundingClientRect().top]);
		const inkOf = (): number => {
			let ink = 0;
			for (const canvas of document.querySelectorAll<HTMLCanvasElement>('[data-canvas-root] canvas[data-canvas-content]')) {
				const box = canvas.getBoundingClientRect();
				if (!canvas.width || box.bottom < 0 || box.top > innerHeight) continue;
				const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
				const [r, g, b] = data;
				for (let i = 0; i < data.length; i += 16)
					if (Math.abs(data[i] - r) + Math.abs(data[i + 1] - g) + Math.abs(data[i + 2] - b) > 120) ink++;
			}
			return ink;
		};
		const sample = (): void => {
			const probe = w.__canvasProbe?.active();
			const lines = probe?.paintedLines().lines ?? [];
			const beside = [
				...shownIn('.texpile-main-editor > :is(.title-field, .title-field-source)', 'title'),
				...shownIn('.comment-rail-visual .comment-card', 'card')
			];
			if (!probe || (!lines.length && !beside.length)) return;
			const rows = [...beside, ...lines.map((line): [string, number] => [line.text, line.top])];
			const state: ShownRows = { path: probe.path, rows: rows.map(([text, top]) => [text, Math.round(top * 100) / 100]) };
			if (withInk && lines.length) state.ink = inkOf();
			const key = JSON.stringify(state);
			if (key !== last) w.shownRows!.push(state);
			last = key;
		};
		const tick = (): void => {
			if (!w.shownRowsOn) return;
			const channel = new MessageChannel();
			channel.port1.onmessage = sample;
			channel.port2.postMessage(null);
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	}, !!options.ink);
}

export function stopShownRows(page: Page): Promise<ShownRows[]> {
	return page.evaluate(() => {
		const w = window as RowsWindow;
		w.shownRowsOn = false;
		return w.shownRows ?? [];
	});
}

/** until no frame ran for a second: the idle slices have measured every block */
export async function quietFrames(page: Page): Promise<void> {
	let last = -1;
	for (let quiet = 0; quiet < 4;) {
		await page.waitForTimeout(300);
		const frames = await page.evaluate(() => (window as RowsWindow).__canvasProbe?.active()?.frameStats().frames ?? 0);
		quiet = frames === last ? quiet + 1 : 0;
		last = frames;
	}
}
