// D33: a face, style, layout or paint error in one block draws that block as its source and never stops the frame
export type BlockFailure = { readonly pos: number; readonly type: string; readonly message: string };

export class BlockFailures {
	private readonly seen = new Map<string, BlockFailure>();

	/** logs once per node type and message; returns the error the block's source layout carries */
	report(pos: number, type: string, thrown: unknown): Error {
		const error = thrown instanceof Error ? thrown : new Error(String(thrown));
		const id = `${type}\u0000${error.message}`;
		if (!this.seen.has(id)) console.error(`[canvas] the ${type} block at ${pos} is drawn as its source`, error);
		this.seen.set(id, { pos, type, message: error.message });
		return error;
	}

	list(): BlockFailure[] {
		return [...this.seen.values()];
	}
}

/** a layout with a NaN or infinite size from some formatting context counts as a throw */
export function unusableSize(width: number, height: number): boolean {
	return !Number.isFinite(width) || !Number.isFinite(height);
}
