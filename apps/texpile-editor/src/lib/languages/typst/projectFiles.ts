// The session's files, pushed to the HOST's tinymist as open documents.
//
// This exists because of a measured hole in the disk route. With any document open, tinymist runs
// a project cache and picks up DISK changes to other files only through its file watcher - which
// lags the write by over a second (measured: write -> ask = 0 items; same ask 1.5s later = 21).
// A guest's keystroke reaches the host's disk instantly via the write-through, and a completion
// asked in the same breath is answered about text from before it. An OPEN document has no such
// lag: its shadow copy is authoritative and current the moment the didChange is on the wire
// (measured: stale disk + fresh didOpen = right answer, immediately).
//
// So the host hands its own server the session's text files as open documents, reconciled from
// the Y.Doc just before each guest request. The one file the host's OWN editor has open is left
// alone - the editor owns that URI's lifecycle and versioning, and client.sync() keeps it fresh.
import { Text } from '@codemirror/state';
import type { LSPClient } from '@codemirror/lsp-client';

export type ProjectFile = {
	/** root-relative, forward-slashed - the session manifest's own key */
	rel: string;
	text: string;
};

/** Which files are worth handing over: the sources typst reads through the language server. */
export const PROJECT_FILE_RE = /\.(typ|bib)$/i;

/** tinymist's own language ids; the id decides how it parses what we send. */
export function languageIdFor(rel: string) {
	return /\.bib$/i.test(rel) ? 'bibtex' : 'typst';
}

/**
 * A file the server has open on our behalf. `version` is LSP's own monotonic counter; `text` is
 * kept so a reconcile can tell a real edit from a re-render of the same content.
 */
type OpenDoc = {
	uri: string;
	version: number;
	text: string;
};

/**
 * Tracks which project files this set has open with the client, and moves the server from one
 * content state to another.
 *
 * Deliberately NOT part of the server's holder count: these are context, not editors. The session
 * takes its own reference (acquireTypstLsp) for as long as guests are being served.
 */
export class ProjectFileSet {
	private open = new Map<string, OpenDoc>();

	constructor(
		private client: LSPClient,
		/** the URI for a project-relative path, under the real workspace root */
		private uriFor: (rel: string) => string
	) {}

	/**
	 * Make the server's view of the project match `files`.
	 *
	 * Ownership is decided per URI, per call: a workspace entry belongs to the host's editor (a
	 * source view, or the visual editor's stream), and the set backs off it in BOTH directions. A
	 * file the editor holds is never opened here, and a file the editor TAKES OVER is forgotten
	 * silently - a didClose at that moment would close the editor's document out from under the
	 * host.
	 *
	 * Every call is guarded: one unreadable file costs that file, never the rest of the project.
	 */
	reconcile(files: ProjectFile[]): void {
		const wanted = new Map<string, ProjectFile>();
		for (const file of files) wanted.set(this.uriFor(file.rel), file);

		for (const [uri, doc] of this.open) {
			if (this.editorOwns(uri)) {
				this.open.delete(uri); // the editor's now; forget without didClose
				continue;
			}
			const still = wanted.get(uri);
			if (!still) {
				this.close(uri);
				continue;
			}
			if (still.text !== doc.text) this.change(uri, still.text);
		}
		for (const [uri, file] of wanted) {
			if (this.open.has(uri) || this.editorOwns(uri)) continue;
			this.openDoc(uri, file.text, languageIdFor(file.rel));
		}
	}

	/** hand everything back; for a deliberate teardown of the set */
	dispose(): void {
		for (const uri of [...this.open.keys()]) {
			if (this.editorOwns(uri)) this.open.delete(uri);
			else this.close(uri);
		}
	}

	/**
	 * Any workspace entry, view or not: the visual editor holds its file with no view at all, and
	 * a second opener there would write the same URI on a version count of its own.
	 */
	private editorOwns(uri: string): boolean {
		try {
			return this.client.workspace.getFile(uri) != null;
		} catch {
			return false;
		}
	}

	private openDoc(uri: string, text: string, languageId: string): void {
		try {
			this.client.didOpen({ uri, languageId, version: 1, doc: Text.of(text.split('\n')), getView: () => null });
			this.open.set(uri, { uri, version: 1, text });
		} catch {
			/* one file failing to open must not abort the rest */
		}
	}

	/**
	 * A full-document didChange. The precise range would be smaller on the wire, but this runs on
	 * a local pipe, only when the content actually moved, and a whole-file replace cannot
	 * desynchronise the server's copy from ours.
	 */
	private change(uri: string, text: string): void {
		const doc = this.open.get(uri);
		if (!doc) return;
		try {
			this.client.notification('textDocument/didChange', {
				textDocument: { uri: doc.uri, version: ++doc.version },
				contentChanges: [{ text }]
			});
			doc.text = text;
		} catch {
			/* leave the old copy in place; the next reconcile tries again */
		}
	}

	private close(uri: string): void {
		try {
			this.client.didClose(uri);
		} catch {
			/* the client may already be disconnected */
		}
		this.open.delete(uri);
	}
}
