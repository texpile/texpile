// what the pointer is over (11.7), read by the block handle, table chrome and overlays
import type { HoverState } from '../../contracts/inputTypes';
import type { FaceElement } from '../../tree/faceElement';

export class HoverTracker implements HoverState {
	chain = $state.raw<readonly FaceElement[]>([]);
	pos = $state<number | null>(null);
	part = $state<string | null>(null);
	blockFor = $state<number | null>(null);
	tableFor = $state<number | null>(null);

	update(next: Partial<HoverState>): void {
		if (next.chain !== undefined) this.chain = next.chain;
		if (next.pos !== undefined) this.pos = next.pos;
		if (next.part !== undefined) this.part = next.part;
		if (next.blockFor !== undefined) this.blockFor = next.blockFor;
		if (next.tableFor !== undefined) this.tableFor = next.tableFor;
	}

	clear(): void {
		this.update({ chain: [], pos: null, part: null, blockFor: null, tableFor: null });
	}
}
