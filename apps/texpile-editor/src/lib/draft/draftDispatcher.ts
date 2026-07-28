// Draft mode's single decision point per edit.
//
// Diff the buffer against the last-compiled source: if exactly one prose paragraph changed, patch
// it INSTANTLY (no debounce -- DraftView.instantPatch coalesces via its own in-flight guard, so
// continuous typing streams patches at the daemon's pace rather than only updating when you
// pause). Any structural change debounces a full recompile instead. Only runs while the preview
// pane is open, since the full compile reads from disk.
//
// The decision layer and paragraph splitter themselves live in $lib/draft/dispatch, shared with
// the headless edit-class matrix (tests/live).
import { get } from 'svelte/store';
import { decideEdit } from '$lib/draft/dispatch';
import { workspaceRoot } from '$lib/workspace/workspaceStore';
import { relFromRoot } from '$lib/workspace/compilePipeline.svelte';

const PATCH_DEBOUNCE_MS = 400;
const RECOMPILE_DEBOUNCE_MS = 500;

/** the slice of DraftView this dispatcher drives (structural, to avoid importing the component) */
export interface DraftTarget {
	instantPatch(req: Record<string, unknown>): void;
	focusAfterCompile(req: { file: string; line: number; endLine?: number; text?: string; listItem?: boolean }): void;
}

export interface DraftDispatchDeps {
	getSource(): string;
	getLoadedPath(): string | null;
	/** draft mode on, preview open, a file loaded, not paused */
	isActive(): boolean;
	flushSaves(): Promise<void>;
	/** bump the trigger DraftView watches to run a full compile */
	triggerFullCompile(): void;
	getTarget(): DraftTarget | null;
}

/** dev-only breadcrumb trail, read by the live edit-class matrix */
const dev = (kind: string, detail?: unknown) => {
	const w = window as unknown as { __draftEvents?: unknown[] };
	(w.__draftEvents ||= []).push({ kind, detail, t: performance.now() });
};

export class DraftDispatcher {
	private timer: ReturnType<typeof setTimeout> | null = null;
	private lastSrc = ''; // source at the last full draft compile; the patch baseline
	private lastPath: string | null = null; // file that source belongs to

	constructor(private deps: DraftDispatchDeps) {}

	/** cancel any debounced compile (teardown, or a new decision superseding the old one) */
	cancel() {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
	}

	private async fullRecompile(src: string) {
		this.lastSrc = src;
		this.lastPath = this.deps.getLoadedPath();
		await this.deps.flushSaves();
		this.deps.triggerFullCompile();
	}

	private debounceRecompile(src: string, ms = RECOMPILE_DEBOUNCE_MS) {
		this.timer = setTimeout(() => void this.fullRecompile(src), ms);
	}

	private advanceBaseline(src: string) {
		this.lastSrc = src;
		this.lastPath = this.deps.getLoadedPath();
	}

	/** an externally triggered full compile already covers the current source; adopt it as the
	 * baseline so the next decision doesn't redundantly recompile the very same text */
	adoptCurrentAsBaseline() {
		this.advanceBaseline(this.deps.getSource());
	}

	/** one decision point per edit; also re-invoked when a compile settles, so edits typed
	 * mid-compile don't wait for the next keystroke to show up */
	run(): void {
		const src = this.deps.getSource();
		const path = this.deps.getLoadedPath();
		this.cancel();
		if (!this.deps.isActive() || src === this.lastSrc) return;

		// path changed since the last compile (switched files): recompile, don't diff
		if (path !== this.lastPath || !this.lastSrc) {
			this.debounceRecompile(src, PATCH_DEBOUNCE_MS);
			return;
		}

		const d = decideEdit(this.lastSrc, src);
		const root = get(workspaceRoot);
		const file = root && path ? relFromRoot(path, root) : null;
		const target = this.deps.getTarget();

		switch (d.kind) {
			case 'noop':
				// render-identical edit: no compile, no patch, just advance the baseline
				this.advanceBaseline(src);
				dev('ws-noop-whitespace', {});
				return;
			case 'boundary':
				dev('ws-recompile', { reason: 'boundary-line' });
				this.debounceRecompile(src);
				return;
			case 'skip-unbalanced':
				// unrepairable mid-command state: hold the preview until the next keystroke
				dev('ws-skip-unbalanced', { line: d.line });
				return;
			case 'env-body':
				dev('ws-recompile', { reason: 'env-body:' + d.env });
				this.debounceRecompile(src);
				return;
			case 'structural':
				// heavier change: wait for a pause before recompiling, then land the view on the
				// first diverging block. Inserts/deletes that CAN render instantly arrived here as
				// 'patch' (the merged engine typeset); there is no JS-placed splice fallback.
				dev('ws-recompile', { reason: d.reason });
				if (file && d.focus)
					target?.focusAfterCompile({
						file,
						line: d.focus.line,
						endLine: d.focus.endLine,
						text: d.focus.text,
						listItem: d.focus.listItem
					});
				this.debounceRecompile(src);
				return;
			case 'patch': {
				// one block changed: patch IMMEDIATELY (no debounce -- instantPatch's in-flight
				// guard coalesces bursts). The daemon typesets IN MEMORY; only an abandon needs the
				// file on disk, so onRecompile saves lazily and then advances the baseline.
				if (!file) return;
				if (d.transient) dev('ws-repaired', { line: d.line });
				dev('ws-dispatch', { file, line: d.line });
				target?.instantPatch({
					file,
					line: d.line,
					endLine: d.endLine,
					text: d.text,
					orig: d.orig,
					transient: d.transient,
					floatInner: d.floatInner,
					listItem: d.listItem,
					cmdChanged: d.cmdChanged,
					onRecompile: async () => {
						await this.deps.flushSaves();
						this.advanceBaseline(src);
					}
				});
				return;
			}
		}
	}
}
