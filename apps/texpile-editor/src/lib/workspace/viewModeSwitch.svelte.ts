// Which view is showing (visual / source / diff), and keeping the scroll position across a switch.
//
// Both directions carry two anchors as file offsets, through the document's source map. `scroll`
// is the viewport-top block; `cursor` is the caret.
//
// Diff is deliberately NOT persisted: a reload restores the last visual/source choice, never diff.
// It is not a third view any more either - asking for it opens a comparison TAB, and visual/source
// still applies inside that tab. The working copy is editable in both; the version compared against
// is the read-only half and lives in the diff layer rather than on screen.
import { browser } from '$lib/runtime';
import { layout, updateLayout } from '$lib/storage/layout';
import { isGitRepo } from '$lib/workspace/scm/gitStore';
import { editorViewStore, viewMode as viewModeStore } from '$lib/stores/editorStore';
import {
	captureVisualAnchor as captureVisualAnchorAt,
	captureSourceAnchor,
	resolveVisualAnchor,
	type SourceAnchor
} from '$lib/editor/visual/modeSwitchAnchors';
import type { ParsedLatexFile } from '$lib/workspace/latexRoundtrip';
import type { SourceMap } from '$lib/editor/visual/sourceSpans';

/** what callers may ASK for. 'diff' is a command - it opens a comparison tab - not a state. */
export type ViewMode = 'visual' | 'source' | 'diff';
/** what this class can actually be in: how the focused tab is rendered, whatever it holds. */
export type EditMode = 'visual' | 'source';
type DocMeta = Pick<ParsedLatexFile, 'preamble' | 'postamble' | 'hadDocumentEnv'> | null;

export type ViewModeDeps = {
	getKind(): string | null;
	getLoadedPath(): string | null;
	getSource(): string;
	getDocMeta(): DocMeta;
	/** the text the doc handed to the editor serializes to; behind getSource() while a parse is in flight */
	getMountedSource(): string | null;
	/** where every run of the visual doc sits in the source */
	getSourceMap(): SourceMap;
	getEncodingIssue(): string | null;
	/** the file came in holding places a merge marked (DocumentBuffer.conflicted) */
	getConflicted(): boolean;
	/** let the visual editor have it back; false while a marked place is left */
	leaveConflicts(): boolean;
	rebuildVisual(): void;
	/** open a comparison of the open file against the last saved version. */
	startCompare(): void;
	captureDiffSnapshot(): void;
};

export class ViewModeSwitch {
	mode = $state<EditMode>('visual');

	/** consumed by SourceEditor at mount */
	sourceScrollAnchor = $state<{ scroll: number | null; cursor: number | null } | null>(null);
	/** $state so the consuming effect re-fires when a new anchor is captured */
	pendingVisualAnchor = $state<SourceAnchor | null>(null);

	constructor(private deps: ViewModeDeps) {}

	/** the source editor that took the anchor is up; a later mount must not take it again */
	sourceMounted(): void {
		if (this.mode !== 'source' || !this.sourceScrollAnchor) return;
		this.sourceScrollAnchor = null;
	}

	/** focus moved to another editor: an anchor not yet taken was for the one it left */
	dropAnchors(): void {
		this.sourceScrollAnchor = null;
		this.pendingVisualAnchor = null;
	}

	/** restore the persisted choice; call once at mount */
	restore() {
		if (browser && layout.current.viewMode === 'source') this.mode = 'source';
	}

	/** entering visual mode: consume the anchor once the PM view exists AND its doc matches the
	 * current source. On the edited path the editor first mounts with the STALE doc while the
	 * worker re-parse runs; consuming then would resolve against the wrong document. */
	tryResolvePendingAnchor(): void {
		const v = editorViewStore.current;
		const anchor = this.pendingVisualAnchor;
		if (!v || anchor == null || this.mode !== 'visual') return;
		if (this.deps.getSource() !== this.deps.getMountedSource()) return; // parse in flight
		this.pendingVisualAnchor = null;
		resolveVisualAnchor(v, anchor, this.deps.getSourceMap());
	}

	/** mirror into the store the editors read */
	syncStore(): void {
		viewModeStore.current = this.mode;
	}

	beforeSwitch: (() => void) | null = null;

	set(mode: ViewMode): void {
		const d = this.deps;
		if (mode === 'visual' && d.getConflicted()) {
			// the pane has been showing the source editor under a 'visual' mode: with every place
			// chosen that becomes true again, and the visual doc has to catch up with the choices
			if (!d.leaveConflicts()) return;
			if (this.mode === 'visual') return d.rebuildVisual();
		}
		if (mode === this.mode) return;
		if (mode === 'diff') {
			// opens a comparison TAB rather than switching this mode: the representation the user
			// chose survives, and applies to the comparison as well
			if (!d.getLoadedPath() || !isGitRepo.current) return;
			d.startCompare();
			return;
		}
		const kind = d.getKind();
		const structured = kind === 'tex' || kind === 'md' || kind === 'typ';
		if (!structured && kind !== 'bib') return;
		if (mode === 'visual' && d.getEncodingIssue()) return;
		if (structured) {
			this.sourceScrollAnchor = null;
			this.pendingVisualAnchor = null;
			// scroll sync: capture the outgoing view's anchor for the incoming one
			if (this.mode === 'visual' && mode === 'source') this.sourceScrollAnchor = captureVisualAnchorAt(this.deps.getSourceMap());
			else if (this.mode === 'source' && mode === 'visual') this.pendingVisualAnchor = captureSourceAnchor();
			this.beforeSwitch?.();
		}
		// switch optimistically; the async parse fills the visual doc when it returns. On failure
		// the rebuild drops back to source with a toast, so the user never gets stuck on a blank
		// pane. .bib uses the raw buffer for both views, so no rebuild is needed.
		this.mode = mode;
		if (structured && mode === 'visual') d.rebuildVisual();
		if (browser) updateLayout({ viewMode: mode });
	}
}
