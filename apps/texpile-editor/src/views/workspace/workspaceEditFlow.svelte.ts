// The edit-persistence flow around the open document: the writer's hooks, the unsaved-edit gate,
// on-disk change detection, tab activation/closing, and the load-the-active-file effect that ties
// them together.
import { fileService } from '$lib/files/service/fileService';
import { addLocalHistory } from '$lib/workspace/localHistory/localHistory.svelte';
import { untrack } from 'svelte';
import { noParse, parseOf } from '$lib/editor/visual/parseOrigins';
import { FileWriter } from '$lib/buffers/fileWriter';
import { fileCacheConflicts } from '$lib/files/sync/conflictQueue.svelte';
import { closeIfDeleted } from '$lib/files/sync/deletedFiles';
import { collabHost } from '$lib/collab/hostStore.svelte';
import { EDIT_ORIGIN } from '$lib/collab/sharedFiles';
import { UnsavedGuard } from '$lib/workspace/unsavedGuard.svelte';
import { fileModifiedSince, recordFileStamp } from '$lib/files/service/fileStamp';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';
import { activeFilePath, activeCompare, activeFigure, isDirty, fileTree, workspaceRoot } from '$lib/workspace/workspaceStore';
import { flatFiles } from '$lib/workspace/treeRefresh';
import { tabs, tabKey, type Tab } from '$lib/workspace/tabs.svelte';
import { editorGroups } from '$lib/workspace/groups/editorGroups.svelte';
import { visualDocCache } from '$lib/workspace/visualDocCache';
import { saveVisualPosition } from '$lib/workspace/visualPositions';
import { editorViewStore } from '$lib/stores/editorStore';
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

/** what the workspace adds to a write: the comment log first, the save check, Local History after */
export type WriteExtras = {
	verify(path: string, content: string): Promise<string | null>;
	beforeWrite(path: string, content: string): Promise<void>;
};

export class WorkspaceEditFlow {
	readonly saver: FileWriter;
	readonly unsaved: UnsavedGuard;

	constructor(private d: EditFlowDeps) {
		const { doc } = d.wsdoc;
		this.saver = new FileWriter({
			getLoadedPath: () => doc.path,
			isGuest: d.guest,
			files: () => collabHost.files,
			keyOf: (p) => collabHost.keyOf(p)
		});
		this.unsaved = new UnsavedGuard({ writer: this.saver });
		fileCacheConflicts.onChoose = (c, choice) => {
			if (choice === 'disk') void addLocalHistory(c.path, c.memory(), 'before-reload');
			void this.saver.resolveConflict(c.path, choice);
		};
		// an edit from the disk, an undo or a collaborator can leave the open file saved or not
		collabHost.onTextChange = (path, origin) => {
			if (samePath(path, doc.path ?? '') && origin !== EDIT_ORIGIN) isDirty.current = this.saver.isDirty(path);
		};

		// the open folder's text buffers, for as long as it is open; a guest's buffers are the session's
		$effect(() => {
			const root = workspaceRoot.current;
			const guest = d.guest();
			untrack(() => {
				fileCacheConflicts.clear();
				if (root && !guest) collabHost.open(root);
				else void collabHost.close();
			});
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
				this.saver.flush(); // persist the outgoing file's queued edit before tearing down its buffers
				doc.loadError = null;
				// the outgoing file stays on screen until loadFile has the new one ready: clearing here
				// first is what made every switch blink through the "Opening…" placeholder
				if (path) d.wsdoc.loadFile(path);
				else d.wsdoc.closeOpenFile();
			});
		});
	}

	/** every write of this workspace's files: checked, recorded, and caught up with the disk first */
	installWriteHooks(extras: WriteExtras, detachDeleted: (path: string) => void, onDiskTaken: (text: string) => void): void {
		const { doc } = this.d.wsdoc;
		function open(path: string): boolean {
			return !!doc.path && samePath(path, doc.path);
		}
		collabHost.setWriteHooks({
			diskChanged: fileModifiedSince,
			recordStamp: recordFileStamp,
			verify: (path, content) => extras.verify(path, content),
			beforeWrite: (path, content) => extras.beforeWrite(path, content),
			afterWrite: (path, content) => {
				// every save keeps a copy in Local History, as VS Code does
				void addLocalHistory(path, content);
				if (open(path) && !this.saver.isDirty(path)) isDirty.current = false;
			},
			diskTaken: (path, disk) => {
				if (!open(path)) return;
				const text = this.saver.textOf(path) ?? disk;
				doc.eol = this.saver.eolOf(path);
				doc.noteConflicts(text);
				isDirty.current = this.saver.isDirty(path);
				onDiskTaken(text);
			},
			conflict: (path, disk, memory) => fileCacheConflicts.add({ path, disk, memory: () => this.saver.textOf(path) ?? memory }),
			resolved: (path) => fileCacheConflicts.remove(path),
			deleted: (path) =>
				void closeIfDeleted(path, {
					exists: async (p) => (await fileService.stat(p)).exists,
					unsavedText: (p) => (this.saver.isDirty(p) ? this.saver.textOf(p) : null),
					detach: (p) => {
						fileCacheConflicts.remove(p);
						detachDeleted(p);
					}
				}),
			failed: (_path, e) =>
				toaster.error({ title: m.wsview_toast_save_failed_title(), description: e instanceof Error ? e.message : m.wsview_error_unknown() })
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
		activeFigure.current = tab.figure ?? null;
		activeFilePath.current = tab.path;
	}

	closeTab(tab: Tab): void {
		const key = tabKey(tab);
		if (this.isFocused(tab)) {
			// Only a FILE tab can hold an unsaved buffer, so only it can be held open by a pending
			// save. A comparison is read-only and closes immediately.
			this.focusNeighbourOf(key);
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
		const sameFigure = activeFigure.current === (tab.figure ?? null);
		return !!active && samePath(active, tab.path) && sameCompare && sameFigure;
	}

	private focusNeighbourOf(key: string): void {
		const next = tabs.neighborOf(key);
		activeCompare.current = next?.compare ?? null;
		activeFigure.current = next?.figure ?? null;
		activeFilePath.current = next?.path ?? null;
	}
}
