// The pictures the figure cards show: drawn in this session, or kept by the desktop app in its own data folder
// under a name made from the picture's source, so a project that is moved or renamed still finds them.
import { nativeBridge } from '$lib/workspace/fileSystem';
import { safeSavedDrawing } from './safeSavedDrawing';

const drawings = new Map<string, string>();
const drawnAt = new Map<string, number>();
const looked = new Set<string>();
const changes = new EventTarget();
let writing: Promise<void> = Promise.resolve();

export function pictureKey(source: string): string {
	return source.trim();
}

export function drawingName(key: string): string {
	let h1 = 0xdeadbeef;
	let h2 = 0x41c6ce57;
	for (let i = 0; i < key.length; i++) {
		const c = key.charCodeAt(i);
		h1 = Math.imul(h1 ^ c, 2654435761);
		h2 = Math.imul(h2 ^ c, 1597334677);
	}
	h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
	return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

function changed(): void {
	changes.dispatchEvent(new Event('change'));
}

export function cachedDrawing(key: string): string | null {
	return drawings.get(key) ?? null;
}

export function drawingTime(key: string): number {
	return drawnAt.get(key) ?? 0;
}

export async function loadSavedDrawing(key: string): Promise<void> {
	const read = nativeBridge()?.figureRead;
	if (!read || drawings.has(key) || looked.has(key)) return;
	looked.add(key);
	const file = await read(drawingName(key)).catch(() => null);
	const saved = file && safeSavedDrawing(file.svg);
	// drawn while the file was being read: that one is newer
	if (!file || !saved || drawings.has(key)) return;
	drawings.set(key, saved);
	drawnAt.set(key, file.mtimeMs);
	changed();
}

export function saveDrawing(key: string, svg: string): void {
	if (drawings.get(key) === svg) return;
	drawings.set(key, svg);
	drawnAt.set(key, Date.now());
	changed();
	const write = nativeBridge()?.figureWrite;
	if (write) writing = writing.then(() => write(drawingName(key), svg)).catch(() => {});
}

export function onDrawingsChange(run: () => void): () => void {
	changes.addEventListener('change', run);
	return () => changes.removeEventListener('change', run);
}
