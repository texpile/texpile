// Draft mode's single decision point per edit. Every change goes to the engine at once, which teleports to the
// last point before it; the main process runs one teleport at a time and keeps only the newest waiting. Once the
// typing rests, a quiet full pass brings the references, the contents and the PDF up to date.
import { relFromRoot } from '$lib/workspace/compilePipeline.svelte';
import type { TeleportOutcome } from './draftTeleport.svelte';
import { REBUILD, TEXT } from './draftInputWatch';

// what a teleport cannot know until a full pass: \ref targets, the contents, citations
const REST_MS = 2500;
const RECOMPILE_DEBOUNCE_MS = 500;

/** the slice of DraftView this dispatcher drives (structural, to avoid importing the component) */
export type DraftTarget = {
	teleportEdit(file: string, text: string): Promise<TeleportOutcome>;
	stageAt(file: string, text: string, line: number): void;
};

/** the first line of the paragraph holding `line` (1-based), as the engine counts it */
export function paragraphStartLine(src: string, line: number): number {
	const lines = src.split(/\r\n|\n|\r/);
	let from = Math.min(Math.max(1, line), lines.length) - 1;
	while (from > 0 && lines[from - 1].trim() !== '') from--;
	return from + 1;
}

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
	// the paragraph an engine was last sent to, and the text it had
	private staged: { path: string; src: string; from: number } | null = null;

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

	/** the caret rests on `line` of the open file: an engine reads on to that paragraph before the first key there.
	 * Only while the preview shows the file's text as it is, since an edit stages its own paragraph */
	caretAt(path: string, src: string, line: number): void {
		if (!this.deps.isActive() || !TEXT.test(path) || src !== this.lastSrc.get(path)) return;
		const from = paragraphStartLine(src, line);
		const was = this.staged;
		if (was && was.path === path && was.src === src && was.from === from) return;
		const root = this.deps.getRoot();
		const target = this.deps.getTarget();
		if (!root || !target) return;
		this.staged = { path, src, from };
		target.stageAt(relFromRoot(path, root), src, line);
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
		// a teleport only carries a .tex file's text; an open .bib or package is read by the full pass
		if (!TEXT.test(path)) {
			if (REBUILD.test(path)) this.rebuild();
			return;
		}
		const root = this.deps.getRoot();
		const target = this.deps.getTarget();
		if (!root || !target) return;
		// an edit the preview drops or holds must not take the pass an earlier edit owed with it
		const restOwed = this.timer !== null;
		this.cancel();
		void target.teleportEdit(relFromRoot(path, root), src).then((outcome) => {
			if (outcome === 'shown' || outcome === 'open') this.after(REST_MS, () => void this.compileNow(true));
			else if (outcome === 'compile') this.after(RECOMPILE_DEBOUNCE_MS, () => void this.compileNow(false));
			else if (restOwed && !this.timer) this.after(REST_MS, () => void this.compileNow(true));
		});
	}
}
