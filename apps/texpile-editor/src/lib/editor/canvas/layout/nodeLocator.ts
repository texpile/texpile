import type { Fragment, Node as PMNode } from 'prosemirror-model';

type Cursor = { readonly index: number; readonly start: number };

/** the nodes of one top-level block by offset; a parent's scan resumes where its last one stopped, so a walk down the block is linear */
export class NodeLocator {
	private readonly cursors = new WeakMap<Fragment, Cursor>();

	constructor(private readonly top: PMNode) {}

	at(offset: number): PMNode | null {
		if (offset === 0) return this.top;
		let node = this.top;
		let pos = offset - 1;
		for (;;) {
			const { index, start } = this.find(node.content, pos);
			const child = node.maybeChild(index);
			if (!child) return null;
			if (start === pos || child.isText) return child;
			pos -= start + 1;
			node = child;
		}
	}

	private find(content: Fragment, pos: number): Cursor {
		if (pos === 0) return { index: 0, start: 0 };
		if (pos === content.size) return { index: content.childCount, start: pos };
		const kept = this.cursors.get(content);
		let index = kept && kept.start <= pos ? kept.index : 0;
		let start = kept && kept.start <= pos ? kept.start : 0;
		for (; ; index++) {
			const end = start + content.child(index).nodeSize;
			if (end >= pos) {
				const found = end === pos ? { index: index + 1, start: end } : { index, start };
				this.cursors.set(content, found);
				return found;
			}
			start = end;
		}
	}
}
