// The edit-persistence flow around the open document: the debounced save pipeline, the
// unsaved-edit gate, on-disk change detection, tab activation/closing, and the load-the-
// active-file effect that ties them together.
import { untrack } from 'svelte';
import { SavePipeline } from '$lib/workspace/savePipeline.svelte';
import { ExternalChangeWatcher } from '$lib/workspace/externalChange.svelte';
import { UnsavedGuard } from '$lib/workspace/unsavedGuard.svelte';
import { diskChangedSince, recordDiskStamp } from '$lib/workspace/diskStamp';
import { activeFilePath, activeCompare, isDirty } from '$lib/workspace/workspaceStore';
import { tabs, tabKey, type Tab } from '$lib/workspace/tabs.svelte';
import { visualDocCache } from '$lib/workspace/visualDocCache';
import { saveVisualPosition } from '$lib/workspace/visualPositions';
import { bodyOffsetOf } from '$lib/workspace/latexRoundtrip';
import { editorViewStore } from '$lib/stores/editorStore';
import { hasVisualMode, isRawTextKind } from '$lib/workspace/documentBuffer.svelte';
import { compileConfig } from '$lib/workspace/projectConfigSync.svelte';
import { settings } from '$lib/settings';
import { samePath } from '$lib/workspace/fileSystem';
import type { WorkspaceProvider } from '$lib/workspace/workspaceProvider';
import type { EditSession } from '$lib/collab/editSession';
import type { WorkspaceDoc } from './workspaceDoc.svelte';

type EditFlowDeps = {
	provider: WorkspaceProvider;
	session: () => EditSession;
	guest: () => boolean;
	wsdoc: WorkspaceDoc;
};

export class WorkspaceEditFlow {
	readonly saver: SavePipeline;
	readonly external: ExternalChangeWatcher;
	readonly unsaved: UnsavedGuard;

	// closing the active tab activates its neighbor; the load effect runs the usual save guards.
	// When that guard will prompt, the tab must survive until the dialog resolves (the store
	// reverts to it meanwhile), so the removal is deferred to the held-switch resolution.
	private pendingTabClose: string | null = null;

	constructor(private d: EditFlowDeps) {
		const { doc, modes } = d.wsdoc;
		// debounced autosave + serial write chain live in lib/workspace/savePipeline.svelte.ts
		this.saver = new SavePipeline({
			sessionEdit: (path, content) => d.session().edit(path, content),
			isGuest: d.guest,
			autosaveActive: () => this.autosaveActive(),
			writeText: (p, content) => d.provider.writeText(p, content),
			getEol: () => doc.eol,
			getLoadedPath: () => doc.path,
			getLiveContent: () => (hasVisualMode(doc.kind) ? doc.texSource : doc.rawContent),
			setDiskBaseline: (content) => (doc.diskBaseline = content),
			setDirty: (dirty) => {
				isDirty.current = dirty;
			},
			diskChanged: diskChangedSince,
			recordDiskStamp,
			// the aborted save's content is still the live buffer, so check() sees dirty-and-different
			// and raises its conflict modal; "keep mine" comes back through saveNow with force
			raiseConflict: () => void this.external.check()
		});
		// on-disk change detection + conflict resolution live in lib/workspace/externalChange.svelte.ts
		this.external = new ExternalChangeWatcher({
			getLoadedPath: () => doc.path,
			isTextual: () => hasVisualMode(doc.kind) || isRawTextKind(doc.kind),
			isStructured: () => hasVisualMode(doc.kind),
			whenIdle: () => this.saver.whenIdle(),
			readText: (p) => d.provider.readText(p),
			getDiskBaseline: () => doc.diskBaseline,
			setDiskBaseline: (t) => (doc.diskBaseline = t),
			getBuffer: () => (hasVisualMode(doc.kind) ? doc.texSource : doc.rawContent),
			setTexSource: (t) => (doc.texSource = t),
			setRawContent: (t) => (doc.rawContent = t),
			setEol: (e) => (doc.eol = e),
			rebuildVisual: () => d.wsdoc.rebuildVisualFromSource(),
			discardQueuedSave: () => this.saver.discard(),
			sessionEdit: (path, content) => d.session().edit(path, content),
			saveNow: () => doc.save(true) // force: the user chose "keep mine" knowing disk differs
		});
		// unsaved-edit gate for both file switches and workspace-level exits
		this.unsaved = new UnsavedGuard({
			saver: () => this.saver,
			getLoadedPath: () => doc.path,
			getEol: () => doc.eol,
			autosaveActive: () => this.autosaveActive(),
			takePendingTabClose: () => {
				const p = this.pendingTabClose;
				this.pendingTabClose = null;
				return p;
			},
			clearPendingTabClose: () => (this.pendingTabClose = null)
		});

		// Every file that opens gains a tab (file tree, SyncTeX jumps, include links, restores).
		//
		// Skipped while the focused tab is a COMPARISON: activating one already placed its tab, and
		// it holds the preview slot. Noting the file here would put a plain file tab into that same
		// slot and evict the comparison, leaving a diff on screen with no tab of its own.
		$effect(() => {
			const p = activeFilePath.current;
			const comparing = activeCompare.current;
			if (p && !comparing) tabs.noteOpened(p);
		});
		// the first edit promotes the preview tab: from here on it is a file you are working on, not
		// one you glanced at, so the next file opened gets a tab of its own instead of taking this slot
		$effect(() => {
			const p = activeFilePath.current;
			if (isDirty.current && p) tabs.keep(p);
		});
		// Leaving a file in visual mode: record the caret before the switch tears the editor down.
		// A SYNCHRONOUS write hook, not an effect: it must run inside the path assignment itself,
		// because several writers mutate more state right after the write (folder switch rebinds
		// docPositions, delete forget()s the entry, openDiff flips the mode) and a save deferred to
		// the effect flush would read that mutated world. Untracked so a write from inside another
		// effect does not adopt this body's reads as dependencies.
		// (Nothing to do for source mode; SourceEditor keeps its own position.)
		$effect(() =>
			activeFilePath.onWrite(() =>
				untrack(() => {
					this.cacheOutgoingDoc();
					const v = editorViewStore.current;
					if (!v || modes.mode !== 'visual' || !doc.path || d.session().collabFor(doc.path)) return;
					saveVisualPosition(v, doc.path, doc.texSource, doc.docMeta ? bodyOffsetOf(doc.docMeta) : 0);
				})
			)
		);
		// load the active file whenever it changes. Everything but the store read is untracked, so
		// this runs exactly once per path change (doc.path updating mid-load must not re-fire it).
		$effect(() => {
			const path = activeFilePath.current;
			untrack(() => {
				// a workspace-level prompt (folder switch / close / window close) detached the pending
				// edit, so the guard below can't see it: park ALL file switches until it resolves, or a
				// Ctrl+Tab under the modal reattaches the edit against the wrong file
				if (this.unsaved.parksAllSwitches) {
					if (path !== doc.path) activeFilePath.current = doc.path;
					return;
				}
				// while the dialog is up, keep the UI parked on the outgoing file; remember the newest
				// destination (Ctrl+Tab still works under the modal) and resolve it after the answer
				if (this.unsaved.held) {
					if (path !== doc.path) {
						this.unsaved.held.target = path;
						activeFilePath.current = doc.path;
					}
					return;
				}
				// autosave off: the outgoing file's edit wasn't auto-written, so ask BEFORE switching.
				if (this.unsaved.needsPromptFor(path)) {
					this.unsaved.beginFileSwitch(path);
					return;
				}
				this.saver.flush(); // persist the outgoing file's queued edit before tearing down its buffers
				doc.loadError = null;
				// the outgoing file stays on screen until loadFile has the new one ready: clearing here
				// first is what made every switch blink through the "Opening…" placeholder
				if (path) d.wsdoc.loadFile(path);
				else d.wsdoc.closeOpenFile();
			});
		});
	}

	/** the EDITED document, not the one parsed on open */
	private cacheOutgoingDoc(): void {
		const { doc } = this.d.wsdoc;
		if (!doc.path || !doc.lastDoc || !doc.docMeta) return;
		if (doc.lastDocSource !== doc.texSource) return;
		visualDocCache.set(doc.path, doc.texSource, {
			doc: doc.lastDoc,
			preamble: doc.docMeta.preamble,
			postamble: doc.docMeta.postamble,
			hadDocumentEnv: doc.docMeta.hadDocumentEnv,
			warnings: []
		});
	}

	// Draft mode leans on the on-disk file staying current: the full compile reads from disk,
	// Live mode and hosting a session both need current-on-disk content (the draft engine writes
	// nothing until a recompile; a session's host is the persistence authority). So autosave is
	// forced effectively on in both, WITHOUT changing the user's setting (it reverts on exit).
	// The Preferences toggle shows this as forced+disabled.
	autosaveActive(): boolean {
		const s = settings.current;
		return s.autosave !== false || compileConfig.current.latex.liveMode || (this.d.session().active && !this.d.guest());
	}

	confirmLeaveUnsaved() {
		return this.unsaved.confirmLeave();
	}

	/** focus a tab. The path drives the whole app; `compare` only decides what the pane renders. */
	activateTab(tab: Tab): void {
		activeCompare.current = tab.compare ?? null;
		activeFilePath.current = tab.path;
	}

	closeTab(tab: Tab): void {
		const key = tabKey(tab);
		if (this.isFocused(tab)) {
			// Only a FILE tab can hold an unsaved buffer, so only it can be held open by a pending
			// save. A comparison is read-only and closes immediately.
			if (!tab.compare && !this.autosaveActive() && this.saver.pending && samePath(this.saver.pending.path, tab.path)) {
				this.pendingTabClose = tab.path;
			}
			this.focusNeighbourOf(key);
			if (this.pendingTabClose) return;
		}
		tabs.close(key);
	}

	/** is this exact tab the focused one: same file AND the same version, or the lack of one */
	private isFocused(tab: Tab): boolean {
		const active = activeFilePath.current;
		const sameCompare = (activeCompare.current?.hash ?? null) === (tab.compare?.hash ?? null);
		return !!active && samePath(active, tab.path) && sameCompare;
	}

	private focusNeighbourOf(key: string): void {
		const next = tabs.neighborOf(key);
		activeCompare.current = next?.compare ?? null;
		activeFilePath.current = next?.path ?? null;
	}
}
