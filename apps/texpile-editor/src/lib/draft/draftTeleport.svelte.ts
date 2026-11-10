// An edit reaches the preview: the engine teleports to the last point before it and ships the pages it changes.
// Whatever a teleport cannot show (an edit to the preamble, a state it refuses) is the caller's to compile.
import { nativeBridge, type DraftPage, type TeleportResult } from '$lib/workspace/fileSystem';
import { m } from '$lib/paraglide/messages';
import type { SourceShift } from './records/sourceShifts';

export type TeleportLanded = Extract<TeleportResult, { ok: true }>;

type TeleportHooks = {
	root: () => string;
	mainFile: () => string;
	applyPage: (p: DraftPage, seq: number) => Promise<void>;
	landed: (r: TeleportLanded, seq: number) => Promise<void>;
	moveSourceLines: (stop: number, shifts: SourceShift[]) => void;
	/** the compile in flight, which lands the index edits teleport from */
	compileInFlight: () => Promise<unknown> | null;
	setStatus: (s: string) => void;
	emit: (kind: string, detail?: unknown) => void;
};

export type TeleportOutcome = 'shown' | 'held' | 'compile' | 'none';

export class DraftTeleport {
	private seq = 0;
	private pageQueue = Promise.resolve();
	// per file, the edit sent last
	private newest = new Map<string, number>();

	constructor(private hooks: TeleportHooks) {}

	/** pages arrive while the teleport runs; returns the unsubscribe */
	attach(): (() => void) | undefined {
		const n = nativeBridge();
		if (!n?.onDraftPage) return undefined;
		return n.onDraftPage((ev) => {
			if (ev.root !== this.hooks.root()) return;
			this.pageQueue = this.pageQueue.then(() => this.hooks.applyPage(ev.page as DraftPage, ev.seq));
		});
	}

	async edit(file: string, text: string): Promise<TeleportOutcome> {
		const n = nativeBridge();
		if (!n?.draftTeleport) return 'none';
		const seq = ++this.seq;
		this.newest.set(file, seq);
		const t0 = performance.now();
		const r = await n.draftTeleport({ root: this.hooks.root(), mainFile: this.hooks.mainFile(), file, text, seq });
		// a new compile would start the running one over, and typing then kept a slow first compile from ending
		const compile = !r.ok && r.reason === 'no-index' ? this.hooks.compileInFlight() : null;
		if (compile) {
			await compile;
			return this.edit(file, text);
		}
		// a compile landed while the edit waited or ran, and may have read the file before the edit reached disk
		if (!r.ok && r.reason === 'replaced') {
			if (this.newest.get(file) !== seq) return 'none';
			await this.hooks.compileInFlight();
			return this.edit(file, text);
		}
		await this.pageQueue;
		this.hooks.emit('teleport', { ...r, seq, file, roundTripMs: Math.round(performance.now() - t0) });
		if (r.ok) {
			await this.hooks.landed(r, seq);
			if (r.from !== undefined) this.hooks.setStatus(m.draft_status_updated({ ms: Math.round(r.ms) }));
			return 'shown';
		}
		if (r.shifts && r.stop !== undefined) this.hooks.moveSourceLines(r.stop, r.shifts);
		if (r.reason === 'held') return 'held';
		if (r.reason === 'superseded' || r.reason === 'outside') return 'none';
		// the preamble changed, or no index yet, or the engine refused: only a full pass shows it
		return 'compile';
	}
}
