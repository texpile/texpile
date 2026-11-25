// counters that cross top-level blocks come from the model (5.7, D29): per block counts with prefix sums over the index
import type { Node as PMNode } from 'prosemirror-model';
import { isSingleLabelEnvironment, numberedLineCount } from '$lib/editor/visual/extensions/mathlivebridge/mathEnvironments';
import type { DocumentCounterName, DocumentCounters } from '../contracts/faceTypes';
import { FenwickSums } from './blockHeights';
import type { BlockIndex, IndexChange } from './blockIndex';

type CounterName = DocumentCounterName;
type BlockCounts = Readonly<Record<CounterName, number>>;

const NAMES: readonly CounterName[] = ['figure', 'table', 'equation'];

/** the sheet's figure counter: numbered images with a label; tables are Typst's and Markdown's table_wrapper; a numbered
 *  display counts its numbered rows, one for a single-number environment (the view's own count where a language hands none) */
export function countOf(node: PMNode, name: CounterName): number {
	if (name === 'table') return node.type.name === 'table_wrapper' ? 1 : 0;
	if (name === 'equation') {
		if (node.type.name !== 'block_math' || !node.attrs.numbered) return 0;
		return isSingleLabelEnvironment(node.attrs.environment || '') ? 1 : numberedLineCount(node.textContent);
	}
	if (node.type.name !== 'image') return 0;
	const label = String(node.attrs.label ?? '');
	return label !== '' && label !== 'null' && String(node.attrs.numbered) !== 'false' ? 1 : 0;
}

export class ModelCounters implements DocumentCounters {
	private readonly perNode = new WeakMap<PMNode, BlockCounts>();
	private sums: Record<CounterName, FenwickSums> | null = null;

	constructor(private readonly index: BlockIndex) {}

	private countsOf(node: PMNode): BlockCounts {
		let counts = this.perNode.get(node);
		if (!counts) {
			const found = { figure: 0, table: 0, equation: 0 };
			for (const name of NAMES) found[name] += countOf(node, name);
			node.descendants((child) => {
				for (const name of NAMES) found[name] += countOf(child, name);
			});
			this.perNode.set(node, (counts = found));
		}
		return counts;
	}

	private build(): Record<CounterName, FenwickSums> {
		const nodes = this.index.blocks.map((entry) => this.countsOf(entry.node));
		return {
			figure: new FenwickSums(nodes.map((c) => c.figure)),
			table: new FenwickSums(nodes.map((c) => c.table)),
			equation: new FenwickSums(nodes.map((c) => c.equation))
		};
	}

	/** a change of the block count rebuilds the sums when next asked; otherwise only replaced blocks recount */
	replaced(change: IndexChange): void {
		const { sums } = this;
		if (!sums) return;
		if (change.to - change.from !== change.removed.length) {
			this.sums = null;
			return;
		}
		for (let i = change.from; i < change.to; i++) {
			const now = this.countsOf(this.index.blocks[i].node);
			const was = this.countsOf(change.removed[i - change.from].node);
			for (const name of NAMES) if (now[name] !== was[name]) sums[name].add(i, now[name] - was[name]);
		}
	}

	/** what the counted nodes starting at or before pos count: the counted node at pos gets its own number */
	at(pos: number, name: CounterName): number {
		if (!this.index.count) return 0;
		const sums = (this.sums ??= this.build());
		const i = this.index.indexAt(pos);
		const entry = this.index.blocks[i];
		let within = entry.pos <= pos ? countOf(entry.node, name) : 0;
		const end = Math.min(pos - entry.pos, entry.node.content.size);
		if (end > 0)
			entry.node.nodesBetween(0, end, (child) => {
				within += countOf(child, name);
			});
		return sums[name].prefix(i) + within;
	}
}
