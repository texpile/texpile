// The edit-persistence flow around the open document: the writer's hooks, the unsaved-edit gate,
// on-disk change detection, tab activation/closing, and the load-the-active-file effect that ties
// them together.
import { addLocalHistory } from '$lib/workspace/localHistory/localHistory.svelte';
import { untrack } from 'svelte';
import { noParse, parseOf } from '$lib/editor/visual/parseOrigins';
import { FileWriter } from '$lib/buffers/fileWriter';
import { ExternalChangeWatcher } from '$lib/workspace/externalChange.svelte';
import { collabHost } from '$lib/collab/hostStore.svelte';
import { EDIT_ORIGIN } from '$lib/collab/sharedFiles';
import { UnsavedGuard } from '$lib/workspace/unsavedGuard.svelte';
import { diskChangedSince, recordDiskStamp } from '$lib/workspace/diskStamp';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';
import { activeFilePath, activeCompare, isDirty, fileTree, workspaceRoot } from '$lib/workspace/workspaceStore';
import { flatFiles } from '$lib/workspace/treeRefresh';
import { tabs, tabKey, type Tab } from '$lib/workspace/tabs.svelte';
import { editorGroups } from '$lib/workspace/groups/editorGroups.svelte';
import { visualDocCache } from '$lib/workspace/visualDocCache';
import { saveVisualPosition } from '$lib/workspace/visualPositions';
import { editorViewStore } from '$lib/stores/editorStore';
import { hasVisualMode, isRawTextKind } from '$lib/workspace/documentBuffer.svelte';
import { basename, samePath } from '$lib/workspace/fileSystem';
import type { WorkspaceProvider } from '$lib/workspace/workspaceProvider';
import type { EditSession } from '$lib/collab/editSession';
import type { WorkspaceDoc } from './workspaceDoc.svelte';

type EditFlowDeps = {
	provider: WorkspaceProvider;
	session: () => EditSession;
	guest: () => boolean;
	wsdoc: WorkspaceDoc;
};

/** what the workspace adds to a write: the comment log first, the save check, Local History after */
export type WriteExtras = {
	verify(path: string, content: string): Promise<string | null>;
	beforeWrite(path: string, content: string): Promise<void>;
};

export class WorkspaceEditFlow {
	readonly saver: FileWriter;
	readonly external: ExternalChangeWatcher;
	readonly unsaved: UnsavedGuard;

	// closing the active tab activates its neighbor; the load effect runs the usual save guards.
	// When that guard will prompt, the tab must survive until the dialog resolves (the store
	// reverts to it meanwhile), so the removal is deferred to the held-switch resolution.
	private pendingTabClose: string | null = null;
	// files told about once already, so a guest typing on one does not stack toasts
	private strandedNoted = new Set<string>();

	constructor(private d: EditFlowDeps) {
		const { doc, modes } = d.wsdoc;
		this.saver = new FileWriter({
			getLoadedPath: () => doc.path,
			isGuest: d.guest,
			files: () => collabHost.files,
			keyOf: (p) => collabHost.keyOf(p)
		});
		// on-disk change detection + conflict resolution live in lib/workspace/externalChange.svelte.ts
		this.external = new ExternalChangeWatcher({
			getLoadedPath: () => doc.path,
			isTextual: () => hasVisualMode(doc.kind) || isRawTextKind(doc.kind),
			whenIdle: () => this.saver.whenIdle(),
			readText: (p) => d.provider.readText(p),
			exists: async (p) => (await d.provider.stat(p)).exists,
			setDeleted: (v) => {
				doc.deletedOnDisk = v;
				if (!v && doc.path) this.saver.resume(doc.path);
			},
			getDiskBaseline: () => doc.diskBaseline,
			setDiskBaseline: (t) => (doc.diskBaseline = t),
			getBuffer: () => (hasVisualMode(doc.kind) ? doc.texSource : doc.rawContent),
			hasUnwritten: (path) => this.saver.isDirty(path),
			adopt: (path, text, eol) => {
				doc.eol = eol;
				doc.noteConflicts(text);
				this.saver.adoptDisk(path, text, eol);
			},
			saveNow: () => doc.save(true) // force: the user chose "keep mine" knowing disk differs
		});
		// unsaved-edit gate for both file switches and workspace-level exits
		this.unsaved = new UnsavedGuard({
			writer: this.saver,
			getLoadedPath: () => doc.path,
			autosaveActive: () => this.autosaveActive(),
			takePendingTabClose: () => {
				const p = this.pendingTabClose;
				this.pendingTabClose = null;
				return p;
			},
			clearPendingTabClose: () => (this.pendingTabClose = null)
		});
		// the open file's buffer follows its text: an edit from the disk, an undo or a collaborator. The visual editor
		// takes those in by its own patch (VisualCollab) and the source editor through its binding
		collabHost.onTextChange = (path, origin) => {
			if (!samePath(path, doc.path ?? '') || origin === EDIT_ORIGIN) return;
			isDirty.current = this.saver.isDirty(path);
			if (modes.mode === 'visual' && hasVisualMode(doc.kind)) return;
			const text = d.session().collabFor(path)?.ytext.toString();
			if (text === undefined) return;
			if (hasVisualMode(doc.kind)) {
				if (doc.texSource !== text) doc.texSource = text;
			} else if (doc.rawContent !== text) doc.rawContent = text;
		};

		// the open folder's text buffers, for as long as it is open; a guest's buffers are the session's
		$effect(() => {
			const root = workspaceRoot.current;
			const guest = d.guest();
			untrack(() => {
				if (root && !guest) collabHost.open(root);
				else void collabHost.close();
			});
		});
		// a file whose write met a change on disk while it was not open asks once it is
		$effect(() => {
			const path = doc.path;
			if (path && untrack(() => this.saver.isRefused(path))) void untrack(() => this.external.check());
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
					this.rememberVisualCaret();
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
				// autosave held off (the file was deleted on disk, or a conflict was put off): the outgoing file's edit was not written, so ask before switching
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

	/** every write of this workspace's files: guarded against changes on disk, checked, recorded */
	installWriteHooks(extras: WriteExtras): void {
		const { doc } = this.d.wsdoc;
		function open(path: string): boolean {
			return !!doc.path && samePath(path, doc.path);
		}
		collabHost.setWriteHooks({
			diskChanged: diskChangedSince,
			recordStamp: recordDiskStamp,
			verify: (path, content) => extras.verify(path, content),
			beforeWrite: (path, content) => extras.beforeWrite(path, content),
			afterWrite: (path, content) => {
				// every save keeps a copy in Local History, as VS Code does
				void addLocalHistory(path, content);
				if (!open(path)) return;
				doc.diskBaseline = content;
				doc.deletedOnDisk = false; // the bytes are on disk again, whatever happened to the old name
				if (!this.saver.isDirty(path)) isDirty.current = false;
			},
			// autosave stands down for this file: writing would recreate a name the user did not ask
			// for, or re-trip the guard behind a question they postponed
			heldOff: (path) => open(path) && !this.autosaveActive(),
			// the refused content is still the file's text, so check() sees dirty-and-different and raises its
			// conflict modal; "keep mine" comes back through saveNow with force
			conflict: (path, deliberate) => {
				if (open(path)) void this.external.check(deliberate);
				else this.noteStranded(path);
			},
			saved: (path) => toaster.success({ title: m.wsview_toast_saved_title(), description: basename(path), duration: 1200 }),
			failed: (_path, e) =>
				toaster.error({ title: m.wsview_toast_save_failed_title(), description: e instanceof Error ? e.message : m.wsview_error_unknown() })
		});
	}

	private noteStranded(path: string): void {
		for (const p of this.strandedNoted) if (!this.saver.isRefused(p)) this.strandedNoted.delete(p);
		if (this.strandedNoted.has(path)) return;
		this.strandedNoted.add(path);
		toaster.warning({
			title: m.wsview_stranded_toast_title({ name: basename(path) }),
			description: m.wsview_stranded_toast_body(),
			action: { label: m.wsview_stranded_open(), onClick: () => this.activateTab({ path }) }
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
			warnings: [],
			map: doc.sourceMap,
			// the parse the edited document still answers to, handed on by the editor's own plugin
			origins: parseOf(doc.lastDoc) ?? noParse()
		});
	}

	/**
	 * Autosave writes the open file without being asked, which is only ever right when writing it
	 * is the obvious thing to do. It is not, for a file that was deleted or renamed from outside
	 * (the write recreates a name nobody asked for) or one holding a conflict the user postponed.
	 * Reporting that as "autosave is not active" rather than checking for it at each call site is
	 * what makes the timer, the switch prompt, the tab close and the window close all agree.
	 */
	autosaveActive(): boolean {
		const doc = this.d.wsdoc.doc;
		// `external` is assigned after the save pipeline, whose deps can ask this during construction
		return !doc.deletedOnDisk && !(doc.path && this.external?.deferred?.path === doc.path);
	}

	confirmLeaveUnsaved() {
		return this.unsaved.confirmLeave();
	}

	/** focus a tab. The path drives the whole app; `compare` only decides what the pane renders. */
	/** the visual caret of the file on screen, in that file's record, while its editor is still the app's */
	rememberVisualCaret(): void {
		const { doc, modes } = this.d.wsdoc;
		const v = editorViewStore.current;
		if (!v || modes.mode !== 'visual' || !doc.path || this.d.session().active) return;
		saveVisualPosition(v, doc.path, doc.texSource, doc.sourceMap);
	}

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
		editorGroups.closeIfEmpty(editorGroups.focusedId);
	}

	reopenTab(): void {
		const live = flatFiles(fileTree.current);
		const tab = tabs.reopen((p) => live.some((f) => samePath(f, p)));
		if (tab) this.activateTab(tab);
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
