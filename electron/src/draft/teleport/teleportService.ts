// An edit to the preview: the engine teleports to the last point before the edit and typesets on until it meets an
// old point in the same state. Pages stream as they ship. One folder is live at a time.
import * as path from 'node:path';
import type { DraftPage } from '../draftProducts';
import type { PointIndex } from './pointIndex';
import { stopPool } from './enginePool';
import { LiveDraft, type TeleportResult } from './liveDraft';

export type { TeleportResult } from './liveDraft';

let live: LiveDraft | null = null;

function same(a: string, b: string): boolean {
	return path.resolve(a).replace(/\\/g, '/') === path.resolve(b).replace(/\\/g, '/');
}

/** a compile's index replaces whatever the teleports built: its text is what disk held when it ran */
export function adoptIndex(c: {
	root: string;
	mainRel: string;
	engineDir: string;
	index: PointIndex;
	count: number;
	srcFiles: string[];
}): void {
	live?.close();
	live = new LiveDraft(c.root, c.mainRel, c.engineDir, c.index, c.count, c.srcFiles);
}

export function stopTeleports(): void {
	live?.close();
	live = null;
	stopPool();
}

export function teleport(
	req: { root: string; mainFile: string; file: string; text: string },
	onPage: (p: DraftPage) => void
): Promise<TeleportResult> {
	if (!live || !same(live.root, req.root) || live.mainRel !== req.mainFile.replace(/\\/g, '/'))
		return Promise.resolve({ ok: false, reason: 'no-index', ms: 0 });
	return live.teleport({ file: req.file, text: req.text }, onPage);
}
