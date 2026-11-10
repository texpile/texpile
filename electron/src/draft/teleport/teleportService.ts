// An edit to the preview: the engine teleports to the last point before the edit and typesets on until it meets an
// old point in the same state. Pages stream as they ship. Each folder has its own live preview.
import type { DraftPage } from '../draftProducts';
import type { PointIndex } from './pointIndex';
import { stopPool } from './enginePool';
import { LiveDraft, type TeleportResult } from './liveDraft';
import { normRoot } from '../../windows/normRoot';

export type { TeleportResult } from './liveDraft';

const lives = new Map<string, LiveDraft>();

/** a compile's index replaces whatever the teleports built: its text is what disk held when it ran */
export function adoptIndex(c: {
	root: string;
	mainRel: string;
	engineDir: string;
	index: PointIndex;
	count: number;
	srcFiles: string[];
}): void {
	const key = normRoot(c.root);
	lives.get(key)?.close(true);
	lives.set(key, new LiveDraft(c.root, c.mainRel, c.engineDir, c.index, c.count, c.srcFiles));
}

let stopsAll = 0;
const stops = new Map<string, number>();
/** counts the folder's stops: a compile that outlives one must not bring the engines back */
export function stopCount(root: string): number {
	return stopsAll + (stops.get(normRoot(root)) ?? 0);
}

/** the folder's live preview and engines stop; with no folder, every folder's */
export function stopTeleports(root?: string): void {
	if (root === undefined) stopsAll++;
	else stops.set(normRoot(root), (stops.get(normRoot(root)) ?? 0) + 1);
	for (const [key, live] of [...lives])
		if (root === undefined || key === normRoot(root)) {
			live.close();
			lives.delete(key);
		}
	stopPool(root);
}

export function teleport(
	req: { root: string; mainFile: string; file: string; text: string },
	onPage: (p: DraftPage) => void
): Promise<TeleportResult> {
	const live = lives.get(normRoot(req.root));
	if (!live || live.mainRel !== req.mainFile.replace(/\\/g, '/')) return Promise.resolve({ ok: false, reason: 'no-index', ms: 0 });
	return live.teleport({ file: req.file, text: req.text }, onPage);
}
