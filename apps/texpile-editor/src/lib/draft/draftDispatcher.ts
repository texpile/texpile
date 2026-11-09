// Draft mode's single decision point per edit. Every change goes to the engine at once, which teleports to the
// last point before it; the main process runs one teleport at a time and keeps only the newest waiting. Once the
// typing rests, a quiet full pass brings the references, the contents and the PDF up to date.
import { relFromRoot } from '$lib/workspace/compilePipeline.svelte';
import type { TeleportOutcome } from './draftTeleport.svelte';

// what a teleport cannot know until a full pass: \ref targets, the contents, citations
const REST_MS = 2500;
const RECOMPILE_DEBOUNCE_MS = 500;

/** the slice of DraftView this dispatcher drives (structural, to avoid importing the component) */
export type DraftTarget = {
	teleportEdit(file: string, text: string): Promise<TeleportOutcome>;
};

export type DraftDispatchDeps = {
	/** where the engine runs: the workspace root, or the main file's folder under `-cd` */
	getRoot(): string;
	getSource(): string;
	getLoadedPath(): string | null;
	/** draft mode on, preview open, a file loaded, not paused */
	isActive(): boolean;
	flushSaves(): Promise<void>;
	/** bump the trigger DraftView watches to run a full compile */
	triggerFullCompile(): void;
	/** the same pass without the "Compiling…" status */
	triggerQuietCompile(): void;
	getTarget(): DraftTarget | null;
};

export class DraftDispatcher {
	private timer: ReturnType<typeof setTimeout> | null = null;
	// per file, the text the preview last showed or was asked to show
	private lastSrc = new Map<string, string>();

	constructor(private deps: DraftDispatchDeps) {}

	cancel(): void {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
	}

	private after(ms: number, run: () => void): void {
		this.cancel();
		this.timer = setTimeout(() => {
			this.timer = null;
			run();
		}, ms);
	}

	private async compileNow(quiet: boolean): Promise<void> {
		await this.deps.flushSaves();
		if (quiet) this.deps.triggerQuietCompile();
		else this.deps.triggerFullCompile();
	}

	/** a file only a full pass reads changed (a .bib, a package, an image) */
	rebuild(): void {
		if (this.deps.isActive()) this.after(RECOMPILE_DEBOUNCE_MS, () => void this.compileNow(true));
	}

	/** a full compile already covers the current source: the next edit is measured from it */
	adoptCurrentAsBaseline(): void {
		const path = this.deps.getLoadedPath();
		if (path) this.lastSrc.set(path, this.deps.getSource());
	}

	/** one decision point per edit; also re-invoked when a compile settles */
	run(): void {
		const src = this.deps.getSource();
		const path = this.deps.getLoadedPath();
		if (path) this.runFile(path, src);
	}

	/** a file the document reads has new text, the open one or another (draftInputWatch) */
	runFile(path: string, src: string): void {
		if (!this.deps.isActive()) return;
		if (src === this.lastSrc.get(path)) return;
		this.lastSrc.set(path, src);
		const root = this.deps.getRoot();
		const target = this.deps.getTarget();
		if (!root || !target) return;
		this.cancel();
		void target.teleportEdit(relFromRoot(path, root), src).then((outcome) => {
			if (outcome === 'shown') this.after(REST_MS, () => void this.compileNow(true));
			else if (outcome === 'compile') this.after(RECOMPILE_DEBOUNCE_MS, () => void this.compileNow(false));
		});
	}
}
