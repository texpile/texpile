// Opening the active file into the editor's buffers.
//
// The switch commits IMMEDIATELY from every entry point (tab, tree, SyncTeX jump, restore): the
// buffers swap now, so the tab bar, mode toggle and window title reflect the new file at once.
// Visual mode then shows its loading pane until the background parse lands, and Source is one
// click away the whole time - the parse never holds the UI.
import { get } from 'svelte/store';
import { activeFilePath, isDirty } from '$lib/workspace/workspaceStore';
import { toLf, detectEol } from '$lib/workspace/fileSystem';
import { fileKind, type DocumentBuffer } from '$lib/workspace/documentBuffer.svelte';
import type { VisualParser, ParseOutcome, ParseFailure } from '$lib/workspace/visualParse.svelte';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';

export interface FileOpenerDeps {
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
	parse(text: string): Promise<ParseOutcome>;
	/** the parse failed: drop to source mode with a toast rather than a stuck spinner */
	fallbackToSource(failure: ParseFailure): void;
	/** anchors and cross-mode history are keyed to the outgoing file */
	resetHistory(text: string): void;
	disableHistory(): void;
	clearPerFileViewState(): void;
	captureDiffSnapshot(): void;
	/** a half-open file must not stay on screen behind the error */
	closeOpenFile(): void;
}

export class FileOpener {
	constructor(private deps: FileOpenerDeps) {}

	/** still the file the user asked for? every await is a chance for a newer switch to win */
	private current(path: string): boolean {
		return get(activeFilePath) === path;
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
			doc.adoptParsed(o.parsed);
			parser.lastParsedSource = source;
			if (this.deps.isSourceMode()) toaster.success({ title: m.wsview_toast_visual_ready_title(), duration: 2500 });
		});
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
			if (k === 'tex') {
				const raw = await d.readText(path);
				if (!this.current(path)) return;
				const text = toLf(raw); // the editor works in LF
				const seq = d.parser.nextSequence();
				if (d.isVisualMode()) this.adoptBackgroundParse(d.parse(text), path, text, seq);

				d.doc.openTex(path, text, detectEol(raw)); // detectEol so a CRLF file isn't rewritten to LF
				d.parser.lastParsedSource = null;
				isDirty.set(false);
				d.resetHistory(text); // the on-disk content is the floor of the cross-mode undo history
				d.clearPerFileViewState();
				if (d.isDiffMode()) d.captureDiffSnapshot(); // re-diff the newly-opened file
			} else if (k === 'text' || k === 'bib') {
				const raw = await d.readText(path);
				if (!this.current(path)) return;
				d.doc.openRaw(path, toLf(raw), detectEol(raw));
				isDirty.set(false);
				d.disableHistory(); // no cross-mode history for these kinds
				d.clearPerFileViewState();
				if (d.isDiffMode()) d.captureDiffSnapshot();
			} else {
				// image / binary / pdf: nothing to load, the viewer just needs the path
				if (!this.current(path)) return;
				d.doc.openOpaque(path);
				d.clearPerFileViewState();
				d.disableHistory();
				isDirty.set(false);
			}
		} catch (e) {
			if (!this.current(path)) return;
			d.closeOpenFile();
			d.doc.loadError = e instanceof Error ? e.message : m.wsview_load_error_fallback();
		}
	}
}
