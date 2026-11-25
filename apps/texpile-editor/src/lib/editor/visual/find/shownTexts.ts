// what each chip of a document draws, read a slice at a time: reading one builds its block, a second a thousand chips
import type { Node } from 'prosemirror-model';
import { isFindUnit } from './findMatches';

export type ReadSlice = { timeRemaining(): number };
/** runs `task` once when the thread is idle; returns the way to cancel it */
export type ScheduleSlice = (task: (slice: ReadSlice) => void) => () => void;

// a slice runs even while the editor stays busy, so the counts do not wait on a long scroll
const LONGEST_WAIT_MS = 100;
// the counts and tints follow at this pace while the texts come in, and once at the end
const REPORT_MS = 250;

function idleSlices(task: (slice: ReadSlice) => void): () => void {
	const handle = requestIdleCallback(task, { timeout: LONGEST_WAIT_MS });
	return () => cancelIdleCallback(handle);
}

export class ShownTexts {
	#doc: Node | null = null;
	#texts = new Map<number, string | null>();
	#todo: number[] = [];
	#next = 0;
	#cancel: (() => void) | null = null;
	#reported = 0;

	constructor(
		/** the text the chip at pos draws, null when it draws nothing readable */
		private readonly read: (pos: number) => string | null,
		/** some texts came in */
		private readonly progressed: () => void,
		private readonly schedule: ScheduleSlice = idleSlices
	) {}

	/** what the chip at pos in `doc` draws; undefined while it is still to be read */
	textAt(doc: Node, pos: number): string | null | undefined {
		return doc === this.#doc ? this.#texts.get(pos) : undefined;
	}

	/** reads the chips of `doc`, dropping what was read of another */
	follow(doc: Node): void {
		if (doc === this.#doc) return;
		this.stop();
		this.#doc = doc;
		doc.descendants((node, pos) => {
			if (node.isText) return false;
			if (!isFindUnit(node)) return true;
			// a formula's drawing is in a shadow tree and reads as symbols, so its LaTeX is searched
			if (node.type.name.includes('math')) this.#texts.set(pos, null);
			else this.#todo.push(pos);
			return false;
		});
		this.#reported = performance.now();
		this.#slice();
	}

	stop(): void {
		this.#cancel?.();
		this.#cancel = null;
		this.#doc = null;
		this.#texts = new Map();
		this.#todo = [];
		this.#next = 0;
	}

	#slice(): void {
		if (this.#next >= this.#todo.length) return;
		this.#cancel = this.schedule((slice) => {
			this.#cancel = null;
			do {
				const pos = this.#todo[this.#next++];
				this.#texts.set(pos, this.read(pos));
			} while (this.#next < this.#todo.length && slice.timeRemaining() > 1);
			const done = this.#next >= this.#todo.length;
			if (done || performance.now() - this.#reported > REPORT_MS) {
				this.#reported = performance.now();
				this.progressed();
			}
			if (!done) this.#slice();
		});
	}
}
