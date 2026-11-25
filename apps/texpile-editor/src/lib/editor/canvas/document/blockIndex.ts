// the top-level blocks with their start positions, patched by identity after each transaction (5.6)
import type { Node as PMNode } from 'prosemirror-model';
import type { DocumentCounterName } from '../contracts/faceTypes';
import type { FaceInputKey } from '../contracts/invalidationTypes';
import type { NodeViewDesc } from '../tree/nodeViewDesc';

/** a counter a face read while building, and what it read (5.7) */
export type CounterRead = { readonly offset: number; readonly name: DocumentCounterName; readonly value: number };

/** the blocks [from, to) of the new index replaced the removed ones */
export type IndexChange = { readonly from: number; readonly to: number; readonly removed: readonly IndexedBlock[] };

export class IndexedBlock {
	pos = 0;
	/** built when the block is first laid out or asked for; carried to the node that replaced it */
	elements: NodeViewDesc | null;
	/** the inputs its faces read (8.5) */
	readonly keys: Map<string, FaceInputKey>;
	counterReads: readonly CounterRead[];

	constructor(
		readonly node: PMNode,
		carried: IndexedBlock | null
	) {
		this.elements = carried?.elements ?? null;
		this.keys = carried?.keys ?? new Map();
		this.counterReads = carried?.counterReads ?? [];
	}

	hold(elements: NodeViewDesc | null): void {
		this.elements = elements;
	}

	/** the counters a build read, replacing earlier reads of the same counter at the same place */
	noteCounterReads(reads: readonly CounterRead[]): void {
		const kept = this.counterReads.filter((r) => !reads.some((n) => n.offset === r.offset && n.name === r.name));
		this.counterReads = [...kept, ...reads];
	}

	/** what the faces read goes with their elements */
	forgetReads(): void {
		this.keys.clear();
		this.counterReads = [];
	}
}

/** how far ahead a replaced block looks for a block of its type to hand its elements to */
const CARRY_LOOKAHEAD = 3;

function entryOf(node: PMNode, carried: IndexedBlock | null = null): IndexedBlock {
	return new IndexedBlock(node, carried);
}

export class BlockIndex {
	blocks: IndexedBlock[] = [];

	constructor(doc: PMNode) {
		doc.forEach((node) => this.blocks.push(entryOf(node)));
		this.restart(0);
	}

	get count(): number {
		return this.blocks.length;
	}

	/** an unchanged node object keeps its entry; a replaced block hands its elements to the next new block of its type */
	update(doc: PMNode): IndexChange {
		const old = this.blocks;
		const count = doc.childCount;
		let head = 0;
		while (head < old.length && head < count && old[head].node === doc.child(head)) head++;
		let tail = 0;
		while (tail < old.length - head && tail < count - head && old[old.length - 1 - tail].node === doc.child(count - 1 - tail)) tail++;
		if (head === old.length && head === count) return { from: head, to: head, removed: [] };
		const replaced = old.slice(head, old.length - tail);
		const fresh: IndexedBlock[] = [];
		let next = 0;
		for (let i = head; i < count - tail; i++) {
			const node = doc.child(i);
			let carried: IndexedBlock | null = null;
			for (let j = next; j < Math.min(replaced.length, next + CARRY_LOOKAHEAD); j++)
				if (replaced[j].elements && replaced[j].node.type === node.type) {
					carried = replaced[j];
					next = j + 1;
					break;
				}
			fresh.push(entryOf(node, carried));
			carried?.hold(null);
		}
		for (const gone of replaced) gone.elements?.destroy();
		this.blocks = [...old.slice(0, head), ...fresh, ...old.slice(old.length - tail)];
		this.restart(head);
		return { from: head, to: head + fresh.length, removed: replaced };
	}

	private restart(from: number): void {
		let pos = from ? this.blocks[from - 1].pos + this.blocks[from - 1].node.nodeSize : 0;
		for (let i = from; i < this.blocks.length; i++) {
			this.blocks[i].pos = pos;
			pos += this.blocks[i].node.nodeSize;
		}
	}

	/** the block holding pos; a boundary answers the block after it, the document's end the last block */
	indexAt(pos: number): number {
		let low = 0;
		let high = this.blocks.length - 1;
		while (low < high) {
			const mid = (low + high + 1) >> 1;
			if (this.blocks[mid].pos <= pos) low = mid;
			else high = mid - 1;
		}
		return low;
	}

	/** where the entry is now, or -1 once a transaction replaced it */
	indexOf(entry: IndexedBlock): number {
		const index = this.indexAt(entry.pos);
		return this.blocks[index] === entry ? index : -1;
	}

	/** the index of the block that starts exactly at pos, or -1 */
	startingAt(pos: number): number {
		const index = this.indexAt(pos);
		return this.blocks[index]?.pos === pos ? index : -1;
	}
}
