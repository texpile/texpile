// Which view is showing (visual / source / diff), and keeping the scroll position across a switch.
//
// Both directions carry two anchors expressed as source-text offsets, resolved positionally via
// the parse-time orig.start stamps: content matching fails wholesale against an edited buffer,
// whereas positions only drift. `scroll` is the viewport-top block; `cursor` is the caret mapped
// proportionally within its block's orig.latex slice.
//
// Diff is a read-only third view and is deliberately NOT persisted: a reload restores the last
// visual/source choice, never diff.
import { get } from 'svelte/store';
import { browser } from '$lib/runtime';
import { isGitRepo } from '$lib/workspace/gitStore';
import { isDirty } from '$lib/workspace/workspaceStore';
import { editorViewStore, viewMode as viewModeStore } from '$lib/stores/editorStore';
import { captureVisualAnchor as captureVisualAnchorAt, captureSourceAnchor, resolveVisualAnchor } from '$lib/editor/modeSwitchAnchors';
import { bodyOffsetOf, type ParsedLatexFile } from '$lib/workspace/latexRoundtrip';
import { createSourceHistory } from '$lib/workspace/sourceHistory';

const VIEW_MODE_KEY = 'texpile:viewMode';

export type ViewMode = 'visual' | 'source' | 'diff';
type DocMeta = Pick<ParsedLatexFile, 'preamble' | 'postamble' | 'hadDocumentEnv'> | null;

export interface ViewModeDeps {
	getKind(): string | null;
	getLoadedPath(): string | null;
	getSource(): string;
	setSource(text: string): void;
	getDocMeta(): DocMeta;
	/** the text the current visual doc was parsed from; null while a parse is in flight */
	getLastParsedSource(): string | null;
	rebuildVisual(): void;
	captureDiffSnapshot(): void;
	scheduleSave(path: string | null, text: string): void;
}

export class ViewModeSwitch {
	mode = $state<ViewMode>('visual');
	/** the last real editing mode, so leaving diff returns where the user was */
	lastEditMode = $state<'visual' | 'source'>('visual');

	/** consumed by SourceEditor at mount */
	sourceScrollAnchor = $state<{ scroll: number | null; cursor: number | null } | null>(null);
	/** $state so the consuming effect re-fires when a new anchor is captured */
	pendingVisualAnchor = $state<{ scroll: number; cursor: number | null } | null>(null);

	/** cross-mode undo/redo; native undo/redo runs first and the editors only call step() when
	 * their own history is exhausted */
	history = createSourceHistory();

	constructor(private deps: ViewModeDeps) {}

	/** restore the persisted choice; call once at mount */
	restore() {
		if (browser && localStorage.getItem(VIEW_MODE_KEY) === 'source') {
			this.mode = 'source';
			this.lastEditMode = 'source';
		}
	}

	/** orig.start stamps are body-relative; bodyOffsetOf knows where the body begins in the FILE
	 * (fragments synthesize a preamble that is not in the file, so theirs starts at 0) */
	private bodyOffset(): number {
		const meta = this.deps.getDocMeta();
		return meta ? bodyOffsetOf(meta) : 0;
	}

	/** entering visual mode: consume the anchor once the PM view exists AND its doc matches the
	 * current source. On the edited path the editor first mounts with the STALE doc while the
	 * worker re-parse runs; consuming then would resolve against the wrong document. */
	tryResolvePendingAnchor(): void {
		const v = get(editorViewStore);
		const anchor = this.pendingVisualAnchor;
		if (!v || anchor == null || this.mode !== 'visual') return;
		if (this.deps.getSource() !== this.deps.getLastParsedSource()) return; // parse in flight
		this.pendingVisualAnchor = null;
		resolveVisualAnchor(v, anchor, this.bodyOffset());
	}

	/** mirror into the store the editors read; diff presents as source to them */
	syncStore(): void {
		viewModeStore.set(this.mode === 'diff' ? 'source' : this.mode);
	}

	set(mode: ViewMode): void {
		const d = this.deps;
		if (mode === this.mode) return;
		if (mode === 'diff') {
			if (!d.getLoadedPath() || !get(isGitRepo)) return;
			this.mode = 'diff';
			// a pending source->visual anchor must not survive a diff detour (exitDiff re-enters
			// visual without coming back through here, so nothing else would clear it)
			this.pendingVisualAnchor = null;
			d.captureDiffSnapshot();
			return;
		}
		const kind = d.getKind();
		if (kind !== 'tex' && kind !== 'bib') return;
		if (kind === 'tex') {
			this.history.capture(d.getSource()); // flush the pre-switch state into the cross-mode history
			// scroll sync: capture the outgoing view's anchor for the incoming one
			if (this.mode === 'visual' && mode === 'source') this.sourceScrollAnchor = captureVisualAnchorAt(this.bodyOffset());
			else if (this.mode === 'source' && mode === 'visual') this.pendingVisualAnchor = captureSourceAnchor();
		}
		// switch optimistically; the async parse fills the visual doc when it returns. On failure
		// the rebuild drops back to source with a toast, so the user never gets stuck on a blank
		// pane. .bib uses the raw buffer for both views, so no rebuild is needed.
		this.mode = mode;
		this.lastEditMode = mode;
		if (kind === 'tex' && mode === 'visual') d.rebuildVisual();
		if (browser) localStorage.setItem(VIEW_MODE_KEY, mode);
	}

	exitDiff(): void {
		this.mode = this.lastEditMode;
		if (this.deps.getKind() === 'tex' && this.lastEditMode === 'visual') this.deps.rebuildVisual();
	}

	/** step the workspace history; false at the stack edge lets the key fall through */
	historyStep(dir: 'undo' | 'redo'): boolean {
		const d = this.deps;
		const path = d.getLoadedPath();
		if (d.getKind() !== 'tex' || !path) return false;
		const target = this.history.step(dir, d.getSource());
		if (target == null) return false;
		d.setSource(target);
		isDirty.set(true);
		d.scheduleSave(path, target);
		// source mode: the editor's value-sync effect replaces the doc. visual mode: re-parse.
		if (this.mode === 'visual') d.rebuildVisual();
		return true;
	}
}
