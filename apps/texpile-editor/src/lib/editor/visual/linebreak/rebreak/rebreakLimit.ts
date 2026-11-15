// two inline views trading sizes would break their paragraph on every frame: a paragraph whose lines keep moving for
// a change of size alone, with no edit in between, is left to the browser
import type { Node as PMNode } from 'prosemirror-model';

const MOST_MOVES_A_SECOND = 6;

export type RebreakLimit = {
	/** the paragraph's lines moved for a change of size; true once that happened too often in a second */
	reached(paragraph: PMNode): boolean;
	/** an edit landed: sizes that change after it are the writer's doing */
	reset(): void;
};

export function rebreakLimit(): RebreakLimit {
	let moves = new WeakMap<PMNode, { since: number; count: number }>();
	return {
		reached(paragraph) {
			const now = performance.now();
			const recent = moves.get(paragraph);
			if (recent && now - recent.since <= 1000) return ++recent.count > MOST_MOVES_A_SECOND;
			moves.set(paragraph, { since: now, count: 1 });
			return false;
		},
		reset() {
			moves = new WeakMap();
		}
	};
}
