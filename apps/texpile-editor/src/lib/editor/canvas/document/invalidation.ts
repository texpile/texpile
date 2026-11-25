// face inputs (8.5): sources fire a key per window; each view relays the blocks that read it, lazily off screen
import type { FaceInputKey, FaceInvalidation } from '../contracts/invalidationTypes';
import type { BlockLayout } from '../contracts/layoutTypes';
import type { BlockIndex, IndexedBlock } from './blockIndex';

const hubs = new WeakMap<Window, FaceInvalidation>();

/** where bitmap, formula, grammar, file and store sources report a changed input: one per window, as the caches (D34) */
export function windowInvalidation(win: Window): FaceInvalidation {
	let hub = hubs.get(win);
	if (!hub) {
		const listeners = new Set<(key: FaceInputKey) => void>();
		hub = {
			fire(key) {
				for (const listener of [...listeners]) listener(key);
			},
			listen(listener) {
				listeners.add(listener);
				return () => listeners.delete(listener);
			}
		};
		hubs.set(win, hub);
	}
	return hub;
}

export function inputKeyOf(key: FaceInputKey): string {
	return Object.values(key).join('\u0000');
}

/** style, fonts and hyphenation make every layout stale; the faces epoch is read like any other input */
export function isLayoutEpoch(key: FaceInputKey): boolean {
	return key.kind === 'epoch' && key.name !== 'faces';
}

export type InputReaders = {
	/** faces read it while building: their elements build again */
	readonly rebuild: readonly IndexedBlock[];
	/** only the layout read it (replaced content's keys): the layout goes, the elements stay */
	readonly relay: readonly IndexedBlock[];
};

/** only blocks that were built or laid out recorded keys, so what is on screen relays and the rest when it scrolls in */
export function readersOf(index: BlockIndex, key: FaceInputKey, layoutOf: (entry: IndexedBlock) => BlockLayout | null): InputReaders {
	const id = inputKeyOf(key);
	const rebuild: IndexedBlock[] = [];
	const relay: IndexedBlock[] = [];
	for (const entry of index.blocks) {
		if (entry.keys.has(id)) rebuild.push(entry);
		else if (layoutOf(entry)?.keys.some((read) => inputKeyOf(read) === id)) relay.push(entry);
	}
	return { rebuild, relay };
}
