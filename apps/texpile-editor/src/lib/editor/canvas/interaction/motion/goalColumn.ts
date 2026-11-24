import type { Selection } from 'prosemirror-state';

/** the doc x a run of Up, Down, PageUp and PageDown keeps to (10.4) */
export class GoalColumn {
	x: number | null = null;
	private head = -1;

	/** the kept x while the head is where the last vertical move put it */
	xFor(selection: Selection): number | null {
		return this.x !== null && selection.head === this.head ? this.x : null;
	}

	/** the x kept while the head stays at `head` */
	keep(x: number, head: number): void {
		this.x = x;
		this.head = head;
	}

	reset(): void {
		this.x = null;
		this.head = -1;
	}
}

const columns = new WeakMap<object, GoalColumn>();

/** the one goal column of a view: the arrows, Shift+arrows and page keys all aim at it */
export function goalColumnOf(view: object): GoalColumn {
	let column = columns.get(view);
	if (!column) columns.set(view, (column = new GoalColumn()));
	return column;
}
