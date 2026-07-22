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
}

/** one diagnostic from the host's compile, file already root-relative. line is absent for warnings
 *  the log gives no source location for (undefined \ref/\cite, package warnings): the Problems panel
 *  still lists them, only the inline underline needs a line. */
export interface SharedDiagnostic {
	file: string;
	line?: number;
	lineEnd?: number;
	level: 'error' | 'warning' | 'badbox';
	message: string;
	hint?: string;
	column?: number;
	anchorText?: string;
	command?: string;
}

/** the host's parsed compile products (aux label numbers + log), shared once instead of every
 *  guest re-parsing artifacts; rides the session meta map so late joiners get it from doc state. */
export interface SharedCompileIntel {
	auxNumbers: Record<string, string>;
	auxPages: Record<string, string>;
	log: SharedDiagnostic[];
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
	/** host: a guest changed files on disk (upload / rename / delete); refresh the tree UI. */
	onFileOp: (() => void) | null;

	/** how the session shares this file: 'binary' can mean a text file shared as name only
	 *  (too large or an unsupported extension). null = not session-managed, trust the disk. */
	sharedKindOf(path: string | null): 'text' | 'binary' | null;
	/** host: publish the parsed compile products to guests. No-op on the guest side. */
	shareCompileIntel(intel: SharedCompileIntel): void;
	/** guest: the host's shared compile products; null for the host (it has the real thing). */
	readonly compileIntel: SharedCompileIntel | null;
	collabFor(path: string | null): CollabBinding | null;
	/** fold the local editor's serialized content into the shared doc as a minimal splice (the
	 *  visual editor's write path on both sides; a no-op splice when the source editor is Y-bound). */
	edit(path: string, content: string): void;
	beforeOpen(path: string): Promise<void>;
	setVisualLock(path: string | null): void;
	syncTree(): Promise<void>;
	pushPdf(path: string): Promise<void>;
	end(tellGuests?: boolean): Promise<void>;
	guestCount(): number;
}
