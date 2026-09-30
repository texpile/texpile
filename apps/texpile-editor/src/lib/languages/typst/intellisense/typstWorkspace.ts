// The documents tinymist has open, and which editor keeps each one current.
//
// @codemirror/lsp-client's default workspace only knows documents with a CodeMirror view, so the
// visual editor - which has none - left the server reading the file on disk: a save behind, plus
// the watcher's ~1.5s. Here a document can be held by the source editor's view, by the visual
// editor's text, or by both at once. The server sees one open document throughout; a mode switch
// only moves who writes to it, so it is never closed and reopened and its versions keep climbing.
import { ChangeSet, Text } from '@codemirror/state';
import { LSPPlugin, Workspace, type WorkspaceFile } from '@codemirror/lsp-client';
import type { EditorView } from '@codemirror/view';

type WorkspaceFileUpdate = ReturnType<Workspace['syncFiles']>[number];

function isHighSurrogate(code: number): boolean {
	return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
	return code >= 0xdc00 && code <= 0xdfff;
}

/**
 * The smallest single edit turning `before` into `after`: the shared prefix and suffix stay, the
 * middle is replaced. A typing pause produces one such range, and sending it rather than the whole
 * document keeps the server's reparse incremental.
 */
export function changeBetween(before: string, after: string): ChangeSet {
	const shortest = Math.min(before.length, after.length);
	let head = 0;
	while (head < shortest && before.charCodeAt(head) === after.charCodeAt(head)) head++;
	let tail = 0;
	while (tail < shortest - head && before.charCodeAt(before.length - 1 - tail) === after.charCodeAt(after.length - 1 - tail)) tail++;
	// LSP positions count UTF-16 units, and one between the halves of a surrogate pair names no
	// character the server can find
	if (head > 0 && isHighSurrogate(before.charCodeAt(head - 1))) head--;
	if (tail > 0 && isLowSurrogate(before.charCodeAt(before.length - tail))) tail--;
	return ChangeSet.of({ from: head, to: before.length - tail, insert: after.slice(head, after.length - tail) }, before.length);
}

function textOf(text: string): Text {
	return Text.of(text.split('\n'));
}

class OpenTypstDocument implements WorkspaceFile {
	/** the source editor holding the document; while there is one, its changes are the truth */
	private view: EditorView | null = null;
	/** text the visual editor handed over that the server has not been sent yet */
	private pending: string | null = null;
	/** the visual editor holds it too, so a source editor letting go does not close it */
	streamed = false;

	constructor(
		readonly uri: string,
		readonly languageId: string,
		public version: number,
		public doc: Text
	) {}

	getView(): EditorView | null {
		return this.view;
	}

	attach(view: EditorView): void {
		this.view = view;
		this.pending = null;
	}

	/** the view is gone; `text` is where it left the document */
	detach(text: string): void {
		this.view = null;
		this.pending = text;
	}

	/** the visual editor's newest text; false when a mounted source editor outranks it */
	stage(text: string): boolean {
		if (this.view) return false;
		this.pending = text;
		return true;
	}

	takePending(): string | null {
		const text = this.pending;
		this.pending = null;
		return text;
	}

	/** move to `doc` as `version`, returning what the client sends for the move */
	advance(doc: Text, changes: ChangeSet, version: number): WorkspaceFileUpdate {
		const update = { file: this, prevDoc: this.doc, changes };
		this.doc = doc;
		this.version = version;
		return update;
	}
}

export class TypstWorkspace extends Workspace {
	files: OpenTypstDocument[] = [];
	/** kept for the client's whole life, so a document closed and reopened never goes back a version */
	private versions = new Map<string, number>();

	override getFile(uri: string): OpenTypstDocument | null {
		return this.files.find((f) => f.uri === uri) ?? null;
	}

	syncFiles(): readonly WorkspaceFileUpdate[] {
		const updates: WorkspaceFileUpdate[] = [];
		for (const file of this.files) {
			const view = file.getView();
			const update = view ? this.syncView(file, view) : this.syncPending(file);
			if (update) updates.push(update);
		}
		return updates;
	}

	/** a source editor mounted on the document */
	openFile(uri: string, languageId: string, view: EditorView): void {
		const file = this.getFile(uri);
		if (!file) {
			const opened = new OpenTypstDocument(uri, languageId, this.nextVersion(uri), view.state.doc);
			opened.attach(view);
			this.add(opened);
			return;
		}
		// the visual editor had it: the plugin takes the view's text as already synced, so the
		// server's copy has to become exactly that before the view takes over
		file.detach(view.state.doc.toString());
		this.client.sync();
		file.attach(view);
	}

	/** a source editor let go of the document */
	closeFile(uri: string, view: EditorView): void {
		const file = this.getFile(uri);
		if (!file || file.getView() !== view) return;
		if (!file.streamed) {
			this.remove(file);
			return;
		}
		// the visual editor carries on from here. The plugin's sync timer died with the view, so
		// what was typed since its last sync goes now
		file.detach(view.state.doc.toString());
		this.client.sync();
	}

	/** the visual editor holds the document, reading `text` */
	openText(uri: string, languageId: string, text: string): void {
		const file = this.getFile(uri);
		if (file) {
			file.streamed = true;
			file.stage(text);
			return;
		}
		const opened = new OpenTypstDocument(uri, languageId, this.nextVersion(uri), textOf(text));
		opened.streamed = true;
		this.add(opened);
	}

	/** the visual editor's newest text, for the next sync; false when a source editor holds the document */
	updateText(uri: string, text: string): boolean {
		return this.getFile(uri)?.stage(text) ?? false;
	}

	closeText(uri: string): void {
		const file = this.getFile(uri);
		if (!file) return;
		file.streamed = false;
		if (!file.getView()) this.remove(file);
	}

	private syncView(file: OpenTypstDocument, view: EditorView): WorkspaceFileUpdate | null {
		const plugin = LSPPlugin.get(view);
		if (!plugin || plugin.unsyncedChanges.empty) return null;
		const update = file.advance(view.state.doc, plugin.unsyncedChanges, this.nextVersion(file.uri));
		plugin.clear();
		return update;
	}

	private syncPending(file: OpenTypstDocument): WorkspaceFileUpdate | null {
		const text = file.takePending();
		if (text === null) return null;
		const changes = changeBetween(file.doc.toString(), text);
		if (changes.empty) return null;
		return file.advance(changes.apply(file.doc), changes, this.nextVersion(file.uri));
	}

	private nextVersion(uri: string): number {
		const version = (this.versions.get(uri) ?? 0) + 1;
		this.versions.set(uri, version);
		return version;
	}

	private add(file: OpenTypstDocument): void {
		this.files = [...this.files, file];
		this.client.didOpen(file);
	}

	private remove(file: OpenTypstDocument): void {
		this.files = this.files.filter((f) => f !== file);
		this.client.didClose(file.uri);
	}
}
