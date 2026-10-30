import type { SyntaxNode } from '@lezer/common';
import { childrenIn, type Stretch } from './stretch';

/** a node, a word of a Text token, or whitespace; `eaten`: the line end after a comment and the indent, which TeX skips */
export type Piece = { node: SyntaxNode; from: number; to: number; kind: 'node' | 'word' | 'space'; eaten?: boolean };

export type CursorMark = { index: number; pos: number };

const SPACE = /[ \t\n\r]/;

/** walks a stretch's children, cutting Text where an argument ends inside it */
export class PieceCursor {
	private readonly kids: SyntaxNode[];
	private index = 0;
	private at: number;

	constructor(
		readonly src: string,
		readonly stretch: Stretch
	) {
		this.kids = childrenIn(stretch);
		this.at = stretch.from;
		this.settle();
	}

	get pos(): number {
		return this.at;
	}

	get end(): number {
		return this.stretch.to;
	}

	save(): CursorMark {
		return { index: this.index, pos: this.at };
	}

	restore(mark: CursorMark): void {
		this.index = mark.index;
		this.at = mark.pos;
	}

	private settle(): void {
		while (this.index < this.kids.length && this.kids[this.index].to <= this.at) this.index++;
	}

	peek(): Piece | null {
		if (this.at >= this.stretch.to) return null;
		const kid = this.kids[this.index];
		if (!kid) return null;
		if (kid.name !== 'Text') return { node: kid, from: kid.from, to: kid.to, kind: 'node' };
		const from = Math.max(this.at, kid.from);
		const limit = Math.min(kid.to, this.stretch.to);
		if (SPACE.test(this.src[from])) {
			let to = from;
			let k = this.index;
			for (;;) {
				const node = this.kids[k];
				const stop = Math.min(node.to, this.stretch.to);
				while (to < stop && SPACE.test(this.src[to])) to++;
				const next = this.kids[k + 1];
				if (to < stop || to >= this.stretch.to || !next || next.name !== 'Text' || next.from !== to) break;
				k++;
			}
			const eaten = from === kid.from && this.kids[this.index - 1]?.name === 'Comment';
			return { node: kid, from, to, kind: 'space', ...(eaten ? { eaten } : {}) };
		}
		let to = from + 1;
		if (this.src[from] !== '&') while (to < limit && !SPACE.test(this.src[to]) && this.src[to] !== '&') to++;
		return { node: kid, from, to, kind: 'word' };
	}

	next(): Piece | null {
		const piece = this.peek();
		if (!piece) return null;
		this.at = Math.max(this.at, piece.to);
		this.settle();
		return piece;
	}

	/** the next character of the word at the cursor, as a piece of its own (\textbf x takes the x) */
	nextChar(): Piece | null {
		const piece = this.peek();
		if (!piece || piece.kind !== 'word') return null;
		this.at = piece.from + 1;
		this.settle();
		return { ...piece, to: piece.from + 1 };
	}
}
