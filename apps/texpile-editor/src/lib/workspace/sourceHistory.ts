/**
 * Cross-mode undo/redo: a snapshot history over the raw source that survives mode switches (the
 * PM/CM histories die with their view). Content equal to the previous/next snapshot MOVES the
 * index instead of pushing, so native undos don't pollute the stack. Trimmed by entry count AND
 * total characters, so a large paper can't pin hundreds of MB of snapshots in a long session.
 */
const MAX_ENTRIES = 200;
const MAX_CHARS = 16_000_000; // ~32 MB of UTF-16 snapshot text

export interface SourceHistory {
	/** seed with the on-disk content: the floor of the history. */
	reset(content: string): void;
	/** empty + inert (capture bails) for file kinds without cross-mode history. */
	disable(): void;
	capture(content: string): void;
	/** the snapshot to apply for a step, or null at the stack edge. flushes `current` first so a
	 * pending debounced capture is never skipped; the internal applying flag (cleared next tick)
	 * swallows the echo capture from the caller's application. */
	step(dir: 'undo' | 'redo', current: string): string | null;
}

export function createSourceHistory(): SourceHistory {
	let hist: string[] = [];
	let index = -1;
	let applying = false;

	function capture(content: string) {
		if (applying || index < 0) return;
		if (hist[index] === content) return;
		if (index > 0 && hist[index - 1] === content) {
			index--; // a native undo walked the buffer back, follow it
			return;
		}
		if (index < hist.length - 1 && hist[index + 1] === content) {
			index++; // a native redo, follow forward
			return;
		}
		hist = [...hist.slice(0, index + 1), content];
		let total = 0;
		for (const s of hist) total += s.length;
		let drop = Math.max(0, hist.length - MAX_ENTRIES);
		// always keep the newest two so one undo step survives even a giant snapshot
		while (drop < hist.length - 2 && total > MAX_CHARS) total -= hist[drop++].length;
		if (drop > 0) hist = hist.slice(drop);
		index = hist.length - 1;
	}

	return {
		reset(content: string) {
			hist = [content];
			index = 0;
		},
		disable() {
			hist = [];
			index = -1;
		},
		capture,
		step(dir: 'undo' | 'redo', current: string): string | null {
			if (index < 0) return null;
			capture(current);
			const target = index + (dir === 'undo' ? -1 : 1);
			if (target < 0 || target >= hist.length) return null;
			index = target;
			applying = true;
			setTimeout(() => (applying = false), 0);
			return hist[target];
		}
	};
}
