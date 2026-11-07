// Files the draft engine read from outside every folder (TeX trees, system fonts): the preview draws pages from them,
// and texfile:// serves exactly these paths beyond the claimed roots. An exact-match set, so the workspace
// confinement stays the only path-prefix rule.
import * as path from 'node:path';

const PREVIEW_EXT = /\.(pfb|enc|otf|ttf|ttc|png|jpe?g|pdf)$/i;
const allowed = new Set<string>();

function keyOf(p: string): string {
	const n = path.normalize(p);
	return process.platform === 'win32' ? n.toLowerCase() : n;
}

export function allowPreviewFile(p: string | null | undefined): void {
	if (p && PREVIEW_EXT.test(p)) allowed.add(keyOf(p));
}

export function isPreviewFile(p: string): boolean {
	return allowed.has(keyOf(p));
}
