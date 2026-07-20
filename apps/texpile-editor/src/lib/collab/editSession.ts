// The editor's view of a live collaboration session, implemented by both the host controller and a
// guest adapter, so WorkspaceView drives either one identically. Host-only methods are no-ops on
// the guest side.

import type * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';
import type { ControlPayload } from './protocol';

export interface CollabBinding {
	ytext: Y.Text;
	awareness: Awareness;
	/** the file is held elsewhere (host's visual editor): edit read-only. */
	readOnly?: boolean;
	/** drop the filesystem-backed editor extensions (guests have no disk). */
	minimal?: boolean;
}

export interface EditSession {
	readonly active: boolean;
	readonly isGuest: boolean;
	/** bumps when the shared file set changes; the editor keys its binding on it. */
	readonly manifestRev: number;
	/** a guest's pushed PDF bytes; null for the host (it shows the compiled file on disk). */
	readonly guestPdf: ArrayBuffer | null;
	onCompileRequest: (() => void) | null;
	/** host: resolve a guest's SyncTeX request and reply. Unused (null) on the guest side. */
	onSyncRequest: ((payload: ControlPayload, from: number) => void) | null;

	collabFor(path: string | null): CollabBinding | null;
	hostEdit(path: string, content: string): void;
	beforeOpen(path: string): Promise<void>;
	setVisualLock(path: string | null): void;
	syncTree(): Promise<void>;
	pushPdf(path: string): Promise<void>;
	end(tellGuests?: boolean): Promise<void>;
	guestCount(): number;
}
