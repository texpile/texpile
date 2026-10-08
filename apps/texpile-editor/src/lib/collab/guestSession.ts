import type * as Y from 'yjs';
import type { EditSession } from './editSession';
import { EDIT_ORIGIN } from './sharedFiles';
import { collabGuest } from './guestStore.svelte';
import { createFileUndo } from '$lib/buffers/fileUndo';

// a file's history on this side, for every editor on it; it goes with the session's doc
const histories = new WeakMap<Y.Text, Y.UndoManager>();
function historyOf(ytext: Y.Text, path: string): Y.UndoManager {
	let um = histories.get(ytext);
	if (!um) {
		um = createFileUndo(ytext, path);
		histories.set(ytext, um);
	}
	return um;
}

// adapts the guest controller to the EditSession shape WorkspaceView drives; host-only methods
// are no-ops (a guest owns no disk, never materializes, never compiles)
export const guestSession: EditSession = {
	get active() {
		return collabGuest.status === 'online' || collabGuest.status === 'reconnecting';
	},
	isGuest: true,
	get manifestRev() {
		return collabGuest.rev;
	},
	get guestPdf() {
		return collabGuest.pdf;
	},
	onCompileRequest: null,
	onSyncRequest: null,
	onFileOp: null,
	shareCompileIntel() {},
	get compileIntel() {
		return collabGuest.compileIntel;
	},
	sharedKindOf(path) {
		if (!path) return null;
		return collabGuest.files.find((f) => f.rel === path)?.kind ?? null;
	},
	collabFor(path) {
		if (!path) return null;
		const ytext = collabGuest.ytextFor(path);
		const awareness = collabGuest.awareness;
		return ytext && awareness ? { ytext, awareness, readOnly: collabGuest.isLocked(path), undo: historyOf(ytext, path) } : null;
	},
	// the guest visual editor's write path; the change syncs to the host, whose materializer lands
	// it on disk. The source editor is Y-bound, so its calls arrive content-equal and change nothing.
	edit(path, content, before) {
		if (!path || collabGuest.isLocked(path)) return;
		const t = collabGuest.ytextFor(path);
		if (!t) return;
		function lf(s: string) {
			return s.replace(/\r\n?/g, '\n');
		}
		collabGuest.fork?.fold(t, lf(content), before === undefined ? undefined : lf(before), EDIT_ORIGIN);
	},
	async beforeOpen() {},
	setVisualLock() {},
	async syncTree() {},
	async pushPdf() {},
	async end() {
		collabGuest.leave();
	},
	guestCount() {
		return collabGuest.peers.length;
	}
};
