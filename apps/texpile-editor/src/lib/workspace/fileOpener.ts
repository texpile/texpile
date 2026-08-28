// Opening the active file into the editor's buffers.
//
// The switch commits IMMEDIATELY from every entry point (tab, tree, SyncTeX jump, restore): the
// buffers swap now, so the tab bar, mode toggle and window title reflect the new file at once.
// Visual mode then shows its loading pane until the background parse lands, and Source is one
// click away the whole time - the parse never holds the UI.
import { activeFilePath, isDirty } from '$lib/workspace/workspaceStore';
import { toLf, detectEol } from '$lib/workspace/fileSystem';
import { recordDiskStamp } from '$lib/workspace/diskStamp';
import { fileKind, formatOf, hasVisualMode, isRawTextKind, type DocumentBuffer } from '$lib/workspace/documentBuffer.svelte';
import type { VisualParser, ParseOutcome, ParseFailure } from '$lib/workspace/visualParse.svelte';
import { visualDocCache } from '$lib/workspace/visualDocCache';
import { sourceEncodingError } from '$lib/workspace/sourceEncoding';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';

export type FileOpenerDeps = {
	doc: DocumentBuffer;
	parser: VisualParser;
	readText(path: string): Promise<string>;
	/** the save pipeline must be idle before we read, or we'd read our own half-written file */
	whenIdle(): Promise<void>;
	isVisualMode(): boolean;
	isSourceMode(): boolean;
	isDiffMode(): boolean;
	/** a .bib the host holds in a non-Y-bound editor is host-exclusive while open */
	claimVisualLock(path: string): void;
	/** settle pending guest edits onto disk before we read it */
	beforeOpen(path: string): Promise<void>;
	parse(text: string, format: 'tex' | 'md' | 'typ'): Promise<ParseOutcome>;
	/** the parse failed: drop to source mode with a toast rather than a stuck spinner */
	fallbackToSource(failure: ParseFailure): void;
	/** anchors and cross-mode history are keyed to the outgoing file */
	resetHistory(text: string): void;
	disableHistory(): void;
	clearPerFileViewState(): void;
	captureDiffSnapshot(): void;
	/** a half-open file must not stay on screen behind the error */
	closeOpenFile(): void;
};

export class FileOpener {
	constructor(private deps: FileOpenerDeps) {}

	/** still the file the user asked for? every await is a chance for a newer switch to win */
	private current(path: string): boolean {
		return activeFilePath.current === path;
	}

	/** the open-time parse finishes here: fill the visual pane (the spinner branch yields to the
	 * editor reactively), or - if the user bailed to Source while it ran - stash the doc so the
	 * Visual toggle is instant. Discarded when superseded or the buffer changed underneath it;
	 * the toggle just reparses then. */
	private adoptBackgroundParse(parseP: Promise<ParseOutcome>, path: string, source: string, seq: number): void {
		const { doc, parser } = this.deps;
		void parseP.then((o) => {
			if (!this.current(path) || !parser.isCurrent(seq) || doc.path !== path) return;
			if (doc.texSource !== source) return; // edited meanwhile: stale, drop it
			if (o.failure) {
				this.deps.fallbackToSource(o.failure);
				return;
			}
			if (!o.parsed) return;
			doc.adoptParsed(o.parsed, source);
			visualDocCache.set(path, source, o.parsed);
			parser.lastParsedSource = source;
			if (this.deps.isSourceMode()) toaster.success({ title: m.wsview_toast_visual_ready_title(), duration: 2500 });
		});
	}

	/**
	 * The file's text, or '' when it is gone from disk AND we are opening it as a comparison.
	 *
	 * A deleted file is exactly what a comparison against an older version is for: that version had
	 * it, the working copy does not, and the diff is the whole file struck out. Letting the read
	 * throw turned that into "ENOENT: no such file or directory" in the middle of the editor, which
	 * is a true sentence and a useless one - the panel had just offered the row that led there.
	 */
	private async readWorkingCopy(path: string): Promise<string> {
		const d = this.deps;
		try {
			const raw = await d.readText(path);
			d.doc.deletedOnDisk = false;
			return raw;
		} catch (e) {
			const missing = /ENOENT|no such file|cannot find|not found/i.test(e instanceof Error ? e.message : String(e));
			if (!missing || !d.isDiffMode()) throw e;
			d.doc.deletedOnDisk = true;
			return '';
		}
	}

	async open(path: string): Promise<void> {
		const d = this.deps;
		try {
			await d.whenIdle();
			// shared session: assert the lock BEFORE reading disk, so a guest can't slip an edit in
			// between the flush and the reactive lock effect
			d.claimVisualLock(path);
			await d.beforeOpen(path);
			if (!this.current(path)) return;

			const k = fileKind(path);
			if (hasVisualMode(k)) {
				const raw = await this.readWorkingCopy(path);
				if (!this.current(path)) return;
				const text = toLf(raw); // the editor works in LF
				// adopted in the same synchronous batch as openTex below, which clears the doc
				const cached = visualDocCache.get(path, text);
				const seq = d.parser.nextSequence();
				const decodable = !sourceEncodingError(text);
				if (decodable && !cached && d.isVisualMode()) this.adoptBackgroundParse(d.parse(text, formatOf(k)), path, text, seq);

				d.doc.openTex(path, text, detectEol(raw)); // detectEol so a CRLF file isn't rewritten to LF
				if (cached) d.doc.adoptParsed(cached, text);
				void recordDiskStamp(path); // arm the external-write guard: disk is known as of this read
				d.parser.lastParsedSource = cached ? text : null;
				isDirty.current = false;
				d.resetHistory(text); // the on-disk content is the floor of the cross-mode undo history
				d.clearPerFileViewState();
				if (d.isDiffMode()) d.captureDiffSnapshot(); // re-diff the newly-opened file
			} else if (isRawTextKind(k)) {
				const raw = await this.readWorkingCopy(path);
				if (!this.current(path)) return;
				d.doc.openRaw(path, toLf(raw), detectEol(raw));
				void recordDiskStamp(path);
				isDirty.current = false;
				d.disableHistory(); // no cross-mode history for these kinds
				d.clearPerFileViewState();
				if (d.isDiffMode()) d.captureDiffSnapshot();
			} else {
				// image / binary / pdf: nothing to load, the viewer just needs the path
				if (!this.current(path)) return;
				d.doc.openOpaque(path);
				d.clearPerFileViewState();
				d.disableHistory();
				isDirty.current = false;
			}
		} catch (e) {
			if (!this.current(path)) return;
			d.closeOpenFile();
			d.doc.loadError = e instanceof Error ? e.message : m.wsview_load_error_fallback();
		}
	}
}
