// The open document and its parse/mode lifecycle. Single source of truth for a .tex file:
// its raw text (doc.texSource), the whole file. The visual editor is a view over it: entry
// parses into doc.visualDoc + doc.docMeta, every visual edit serializes straight back into
// doc.texSource, and source mode binds to it directly. No rival copy can drift.
import { mark } from '$lib/debug/startupDoctor';
import { untrack } from 'svelte';
import { DocumentBuffer, fileKind, formatOf, hasVisualMode } from '$lib/workspace/documentBuffer.svelte';
import { ViewModeSwitch } from '$lib/workspace/viewModeSwitch.svelte';
import { DiffMode } from '$lib/workspace/diffMode.svelte';
import { FileOpener } from '$lib/workspace/fileOpener';
import { VisualParser, type ParseFailure } from '$lib/workspace/visualParse.svelte';
import { detectMainFile, gatherProjectMacros } from '$lib/workspace/project';
import { workspaceRoot, activeCompare, activeFilePath } from '$lib/workspace/workspaceStore';
import { editorViewStore } from '$lib/stores/editorStore';
import { visualDocCache } from '$lib/workspace/visualDocCache';
import type { WorkspaceProvider } from '$lib/workspace/workspaceProvider';
import type { EditSession } from '$lib/collab/editSession';
import type { SavePipeline } from '$lib/workspace/savePipeline.svelte';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';

type DocDeps = {
	provider: WorkspaceProvider;
	session: () => EditSession;
	guest: () => boolean;
	visualCollab: () => { noteLocalEdit(): void; noteFreshParse(): void } | null;
	saver: () => SavePipeline;
	/** a jump asked for the incoming file survives the switch; older ones must not */
	clearStaleGoto: (loadedPath: string | null) => void;
	/** compare the open file against the last saved version, in a tab of its own */
	startCompare: () => void;
};

export class WorkspaceDoc {
	// macro-defining text from the main file's include chain, fed to the parser (see workspace/project.ts)
	projectMacros = $state('');

	// worker parse + sequencing live in lib/workspace/visualParse.svelte.ts
	readonly parser = new VisualParser(() => this.projectMacros);
	readonly doc: DocumentBuffer;
	readonly modes: ViewModeSwitch;
	readonly diff: DiffMode;
	private opener: FileOpener;

	constructor(private d: DocDeps) {
		// the open file's buffers and edit handlers live in lib/workspace/documentBuffer.svelte.ts
		this.doc = new DocumentBuffer({
			scheduleSave: (path, content) => d.saver().schedule(path, content),
			discardQueuedSave: () => d.saver().discard(),
			writeNow: (path, content, force) => void d.saver().enqueue(path, content, true, force),
			rebuildVisual: () => this.rebuildVisualFromSource(),
			isVisualMode: () => this.modes.mode === 'visual',
			noteLocalEdit: () => d.visualCollab()?.noteLocalEdit(),
			clearPendingAnchor: () => (this.modes.pendingVisualAnchor = null)
		});
		// view mode, scroll anchors and cross-mode history live in lib/workspace/viewModeSwitch.svelte.ts
		this.modes = new ViewModeSwitch({
			getKind: () => this.doc.kind,
			getLoadedPath: () => this.doc.path,
			getSource: () => this.doc.texSource,
			setSource: (t) => (this.doc.texSource = t),
			getDocMeta: () => this.doc.docMeta,
			getLastParsedSource: () => this.parser.lastParsedSource,
			getEncodingIssue: () => this.doc.encodingIssue,
			rebuildVisual: () => this.rebuildVisualFromSource(),
			captureDiffSnapshot: () => void this.diff.snapshot(),
			startCompare: () => d.startCompare(),
			scheduleSave: (path, text) => d.saver().schedule(path, text)
		});
		// state and snapshotting live in lib/workspace/diffMode.svelte.ts. The version is
		// snapshotted, not bound - it is the half that cannot change.
		this.diff = new DiffMode({
			getLoadedPath: () => this.doc.path,
			getWorkingText: () => (hasVisualMode(this.doc.kind) ? this.doc.texSource : this.doc.rawContent),
			// same macro context as the live document, or the diff reports the difference between two
			// parsers rather than between two versions
			getMacros: () => this.projectMacros
		});
		// opening the active file into the buffers lives in lib/workspace/fileOpener.ts
		this.opener = new FileOpener({
			doc: this.doc,
			parser: this.parser,
			readText: (p) => d.provider.readText(p),
			probe: async (p) => (await d.provider.probe?.(p)) ?? null,
			whenIdle: () => d.saver().whenIdle(),
			isVisualMode: () => this.modes.mode === 'visual',
			isSourceMode: () => this.modes.mode === 'source',
			isDiffMode: () => !!activeCompare.current,
			claimVisualLock: (path) => {
				const session = d.session();
				if (session.active) session.setVisualLock(this.hostHoldsExclusively(fileKind(path), this.modes.mode, path) ? path : null);
			},
			beforeOpen: (path) => d.session().beforeOpen(path),
			// MUST honor the opener's format: it parses BEFORE doc.path switches, so the reactive
			// `kind` (tryParseVisual) still points at the outgoing file and cross-format opens
			// would parse .tex as markdown (and vice versa)
			parse: (text, format) => this.parser.parse(text, format),
			fallbackToSource: (failure) => this.fallbackToSource(failure),
			resetHistory: (text) => this.modes.history.reset(text),
			disableHistory: () => this.modes.history.disable(),
			clearPerFileViewState: () => this.clearPerFileViewState(),
			captureDiffSnapshot: () => void this.diff.snapshot(),
			closeOpenFile: () => this.closeOpenFile()
		});

		// mirror to the global store so menuBarCommands can route Insert/Format
		$effect(() => this.modes.syncStore());
		// the doc.visualDoc dep re-fires this when an async re-parse lands (the doc swap itself is untracked)
		$effect(() => {
			void editorViewStore.current;
			void this.doc.visualDoc;
			void this.modes.pendingVisualAnchor;
			void this.modes.mode;
			this.modes.tryResolvePendingAnchor();
		});
		// guests never enter diff (no disk/git to diff against); visual is fine, it runs on the
		// shared Y.Text like everything else
		$effect(() => {
			if (d.guest() && activeCompare.current) activeCompare.current = null;
		});
		/**
		 * Depends on the COMPARISON alone. The snapshot is untracked: as a dependency the working
		 * buffer would re-diff on every keystroke, and the path would fire on a file SWITCH while
		 * the incoming buffer is still loading, capturing the outgoing file. FileOpener covers that.
		 */
		$effect(() => {
			const compare = activeCompare.current;
			untrack(() => {
				this.diff.setCompareRef(compare);
				if (compare && activeFilePath.current) void this.diff.snapshot();
			});
		});
		// Waits for visual mode to be showing: a source comparison never needs the version parsed.
		$effect(() => {
			void this.diff.original; // the dependency: a new version's bytes start a new parse
			const kind = this.doc.kind;
			if (!activeCompare.current || this.modes.mode !== 'visual' || !hasVisualMode(kind)) return;
			if (this.diff.originalFor !== this.doc.path) return;
			untrack(() => void this.diff.ensureVersionDoc(kind as 'tex' | 'md' | 'typ'));
		});
		// shared session: a file the host holds in a NON-Y-bound editor is host-exclusive (guests go
		// read-only), else concurrent guest edits to that file's Y.Text would be clobbered.
		$effect(() => {
			const session = d.session();
			if (!session.active) return;
			session.setVisualLock(this.hostHoldsExclusively(this.doc.kind, this.modes.mode, this.doc.path) ? this.doc.path : null);
		});
		// guests: resolve the main file + cross-file macro context from the shared doc (the host-only
		// initProject never runs for them), re-gathered when the shared file set changes, so visual
		// parses see the project's custom macro signatures and can't mis-serialize a guest edit
		$effect(() => {
			if (!d.guest() || !d.session().active) return;
			void d.session().manifestRev;
			const root = workspaceRoot.current;
			if (!root) return;
			void (async () => {
				try {
					const files = await d.provider.scanTexFiles(root);
					const main = await detectMainFile(files, d.provider.readText);
					const macros = main ? await gatherProjectMacros(main, root, d.provider.readText) : '';
					if (macros === this.projectMacros) return;
					this.projectMacros = macros;
					// signatures changed: a doc parsed without them is stale, re-derive the open one
					this.parser.lastParsedSource = '';
					if (this.doc.path && this.doc.kind === 'tex' && this.modes.mode === 'visual') this.rebuildVisualFromSource();
				} catch {
					this.projectMacros = '';
				}
			})();
		});
	}

	tryParseVisual(text: string) {
		return this.parser.parse(text, formatOf(this.doc.kind));
	}

	/**
	 * A file the host holds in a non-Y-bound editor is host-exclusive. Source mode (tex/bib/text)
	 * is Y-bound and co-edits freely; BOTH visual dialects consume remote edits through the
	 * re-parse patcher (VisualCollab), so only bib held in BibManager still locks - BibManager
	 * isn't wired to the shared doc at all.
	 */
	hostHoldsExclusively(k: string | null, mode: string, path: string | null): boolean {
		if (!path) return false;
		// markdown was listed here only while it had no remote-patch path; VisualCollab now serves
		// both visual dialects, so it co-edits exactly like tex does
		return k === 'bib' && mode !== 'source';
	}

	loadFile(path: string) {
		mark('file-open');
		return this.opener.open(path);
	}

	/** drop the open file's buffers AND the per-file view state that must not leak into the next file */
	/** the binary warning's way in: read the file as text after all */
	openAsText(path: string): void {
		void this.opener.openAsText(path);
	}

	closeOpenFile(): void {
		this.doc.close();
		this.clearPerFileViewState();
		this.modes.history.disable();
	}

	/** anchors are keyed to the outgoing file's text; a new file must never inherit them */
	clearPerFileViewState(): void {
		this.modes.sourceScrollAnchor = null;
		this.modes.pendingVisualAnchor = null;
		this.d.clearStaleGoto(this.doc.path);
	}

	fallbackToSource(failure: ParseFailure): void {
		this.modes.mode = 'source';
		this.doc.visualDoc = null;
		this.modes.pendingVisualAnchor = null; // never re-anchor a later visual entry off this failed switch
		if (failure.tooComplex) {
			toaster.warning({
				title: m.wsview_toast_too_complex_title(),
				description: m.wsview_toast_too_complex_desc({ count: failure.tooComplex.toLocaleString() })
			});
		} else if (failure.timeout) {
			toaster.warning({ title: m.wsview_toast_file_too_large_title() });
		} else {
			toaster.error({ title: m.wsview_toast_parse_failed_title(), description: failure.message });
		}
	}

	rebuildVisualFromSource(): void {
		if (this.doc.encodingIssue) return;
		// fast path: source unchanged since the last successful parse, keep the mounted PM view
		if (this.doc.texSource === this.parser.lastParsedSource && this.doc.visualDoc) return;

		// the text being parsed, not doc.texSource on arrival, or the fast path above skips a rebuild
		const source = this.doc.texSource;
		const path = this.doc.path;
		const mySeq = this.parser.nextSequence();
		void this.tryParseVisual(source).then((o) => {
			if (!this.parser.isCurrent(mySeq)) return; // superseded
			if (o.failure) return this.fallbackToSource(o.failure);
			if (!o.parsed) return;
			this.doc.adoptParsed(o.parsed, source);
			this.parser.lastParsedSource = source;
			if (path && path === this.doc.path) visualDocCache.set(path, source, o.parsed);
			this.d.visualCollab()?.noteFreshParse(); // a full re-parse stamped everything fresh
			// EditorView reacts to the new localValue and swaps state on the existing instance: no remount, no flicker
		});
	}

	/** manual save (Ctrl/Cmd+S or the Save button); autosave handles the rest */
	save() {
		return this.doc.save();
	}
}
