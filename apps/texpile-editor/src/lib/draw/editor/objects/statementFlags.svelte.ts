import { subtree, type StatementTree } from './statementTree';

export type StatementFlag = 'hidden' | 'locked';

/** hidden and locked statements: the editor's own, never written into the text */
export class StatementFlags {
	hidden = $state<number[]>([]);
	locked = $state<number[]>([]);
	#tree: () => StatementTree;

	/** everything inside a hidden or locked scope is too */
	hiddenAll = $derived(new Set(this.hidden.flatMap((i) => subtree(this.#tree(), i))));
	lockedAll = $derived(new Set(this.locked.flatMap((i) => subtree(this.#tree(), i))));

	constructor(tree: () => StatementTree) {
		this.#tree = tree;
	}

	toggle(flag: StatementFlag, i: number) {
		this[flag] = this[flag].includes(i) ? this[flag].filter((s) => s !== i) : [...this[flag], i];
	}

	set(flag: StatementFlag, ids: number[], on: boolean) {
		this[flag] = on ? [...new Set([...this[flag], ...ids])] : this[flag].filter((s) => !ids.includes(s));
	}

	/** after an edit renumbers the statements */
	carry(follow: (ids: number[]) => number[]) {
		if (this.hidden.length) this.hidden = follow(this.hidden);
		if (this.locked.length) this.locked = follow(this.locked);
	}

	clear() {
		this.hidden = [];
		this.locked = [];
	}
}
