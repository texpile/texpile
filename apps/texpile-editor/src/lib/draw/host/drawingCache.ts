// the last drawing of each picture a figure tab drew, kept in .texpile/figures, so the paper shows it without starting TeX
import { fileService } from '$lib/files/service/fileService';
import { workspaceRoot } from '$lib/workspace/workspaceStore';
import { ensureTexpileIgnore, texpilePath } from '$lib/workspace/texpileDir';

// the drawings kept, the most recently drawn; a picture edited a hundred times leaves one each
const KEPT = 200;
const INDEX = 'figures/index.json';

const drawings = new Map<string, string>();
const looked = new Set<string>();
const changes = new EventTarget();
let writing: Promise<void> = Promise.resolve();

/** a picture by its source as written, its surrounding blanks aside */
export function pictureKey(source: string): string {
	return source.trim();
}

/** a short stable name for a picture's file */
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

/** the drawing a figure tab made of this picture in an earlier session, read once */
export async function loadSavedDrawing(key: string): Promise<void> {
	const path = texpilePath(workspaceRoot.current ?? '', `figures/${drawingName(key)}.svg`);
	if (!path || drawings.has(key) || looked.has(path)) return;
	looked.add(path);
	if (!(await fileService.exists(path))) return;
	drawings.set(key, await fileService.readText(path));
	changed();
}

async function keep(root: string, name: string, svg: string): Promise<void> {
	const file = texpilePath(root, `figures/${name}.svg`);
	const index = texpilePath(root, INDEX);
	if (!file || !index) return;
	await ensureTexpileIgnore(root);
	await fileService.writeText(file, svg);
	const names: string[] = (await fileService.exists(index)) ? JSON.parse(await fileService.readText(index)) : [];
	const kept = [...names.filter((n) => n !== name), name];
	for (const old of kept.splice(0, Math.max(0, kept.length - KEPT))) {
		const path = texpilePath(root, `figures/${old}.svg`);
		if (path) await fileService.remove(path).catch(() => {});
	}
	await fileService.writeText(index, JSON.stringify(kept));
}

export function saveDrawing(key: string, svg: string): void {
	if (drawings.get(key) === svg) return;
	drawings.set(key, svg);
	changed();
	const root = workspaceRoot.current;
	if (root) writing = writing.then(() => keep(root, drawingName(key), svg)).catch(() => {});
}

export function onDrawingsChange(run: () => void): () => void {
	changes.addEventListener('change', run);
	return () => changes.removeEventListener('change', run);
}
