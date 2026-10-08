// Where an editor window opens: under the pointer that dropped it, its strip where the tab was held, on the screen
const WIDTH = 760;
const HEIGHT = 900;

type ScreenArea = { availLeft?: number; availTop?: number; availWidth: number; availHeight: number };

export function editorWindowBounds(
	at: { x: number; y: number },
	area: ScreenArea
): { left: number; top: number; width: number; height: number } {
	const minLeft = area.availLeft ?? 0;
	const minTop = area.availTop ?? 0;
	const width = Math.min(WIDTH, area.availWidth);
	const height = Math.min(HEIGHT, area.availHeight);
	const left = Math.round(Math.min(Math.max(at.x - 120, minLeft), minLeft + area.availWidth - width));
	const top = Math.round(Math.min(Math.max(at.y - 20, minTop), minTop + area.availHeight - height));
	return { left, top, width, height };
}

/** window.open's features for it */
export function editorWindowFeatures(at: { x: number; y: number }, area: ScreenArea): string {
	const b = editorWindowBounds(at, area);
	return `popup=yes,left=${b.left},top=${b.top},width=${b.width},height=${b.height}`;
}
