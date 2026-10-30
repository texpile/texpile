// the last drawing of each picture a figure tab drew, so the paper shows it without starting TeX
const drawings = new Map<string, string>();
const changes = new EventTarget();

/** a picture by its source as written, its surrounding blanks aside */
export function pictureKey(source: string): string {
	return source.trim();
}

export function cachedDrawing(key: string): string | null {
	return drawings.get(key) ?? null;
}

export function saveDrawing(key: string, svg: string): void {
	if (drawings.get(key) === svg) return;
	drawings.set(key, svg);
	changes.dispatchEvent(new Event('change'));
}

export function onDrawingsChange(run: () => void): () => void {
	changes.addEventListener('change', run);
	return () => changes.removeEventListener('change', run);
}
