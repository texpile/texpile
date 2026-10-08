// The open file's buffers, and every way they can be edited.
//
// For a .tex file `texSource` is the single source of truth: the whole file, as raw text. The
// visual editor is a VIEW over it - entry parses into `visualDoc` + `docMeta`, every visual edit
// serializes straight back into `texSource`, and source mode binds to it directly. No rival copy
// can drift. Non-.tex text files bypass all that and edit `rawContent` directly.
import { isDirty } from '$lib/workspace/workspaceStore';
import { parseLatexRegion, serializeLatexFileDetailed, type ParsedLatexFile } from '$lib/workspace/latexRoundtrip';
import { parseMarkdownRegion, serializeMarkdownFileDetailed } from '$lib/languages/markdown/visual/roundtrip';
import { parseTypstRegion, serializeTypstFileDetailed } from '$lib/languages/typst/visual/roundtrip';
import { emptyMap, type RegionParser, type SourceMap } from '$lib/editor/visual/sourceSpans';
import { verifiedSerialize } from '$lib/workspace/verifiedSerialize';
import { replacePreambleFrontmatter } from '$lib/editor/visual/extensions/raw-latex/frontmatterView';
import { basename, relativeTo, samePath, type Eol } from '$lib/workspace/fileSystem';
import { citationVariantsFor } from '$lib/languages/latex/visual/extensions/citation/citationVariantsFor';
import { refCommandsFor } from '$lib/languages/latex/visual/extensions/drawn/settings/refCommandsFor';
import { bibliographyKindFor } from '$lib/languages/latex/visual/extensions/drawn/settings/bibliographyCommand';
import { templateFeaturesStore } from '$lib/stores/editorStore';
import { documentHyphenationLanguage } from '$lib/editor/visual/linebreak/documentHyphenationLanguage';
import { crossRefNamesFromPreamble } from '$lib/languages/latex/visual/extensions/drawn/crossRefNames';
import { scanMacroDefinitions } from '$lib/editor/source/extensions/math-preview/userMacros';
import { findConflicts, hasConflictMarkers, hasMarkerLines } from '$lib/workspace/scm/conflictMarkers';
import { gitChanges, isConflicted } from '$lib/workspace/scm/gitStore';
import type { Node as PMNode } from 'prosemirror-model';

export type FileKind = 'tex' | 'md' | 'typ' | 'bib' | 'pdf' | 'image' | 'binary' | 'text' | null;
export type DocMeta = Pick<ParsedLatexFile, 'preamble' | 'postamble' | 'hadDocumentEnv'> | null;

const IMAGE_EXT = /\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i;
const BINARY_EXT = /\.(pdf|zip|gz|tar|otf|ttf|woff2?|eot|docx?|pptx?|xlsx?|bin)$/i;

export function fileKind(path: string | null): FileKind {
	if (!path) return null;
	if (/\.tex$/i.test(path)) return 'tex';
	if (/\.(md|markdown)$/i.test(path)) return 'md';
	if (/\.typ$/i.test(path)) return 'typ';
	if (/\.bib$/i.test(path)) return 'bib';
	if (/\.pdf$/i.test(path)) return 'pdf';
	if (IMAGE_EXT.test(path)) return 'image';
	if (BINARY_EXT.test(path)) return 'binary';
	return 'text';
}

/** kinds that parse into the visual (ProseMirror) editor and hold their source in texSource. */
export function hasVisualMode(kind: FileKind): kind is 'tex' | 'md' | 'typ' {
	return kind === 'tex' || kind === 'md' || kind === 'typ';
}

/** the dialect the parser / serializer should use for a structured kind. */
export function formatOf(kind: FileKind): 'tex' | 'md' | 'typ' {
	return kind === 'md' ? 'md' : kind === 'typ' ? 'typ' : 'tex';
}

/** kinds edited as raw text in the source editor, with no visual representation. */
export function isRawTextKind(kind: FileKind): kind is 'text' | 'bib' {
	return kind === 'text' || kind === 'bib';
}

export type DocumentBufferDeps = {
	/** carry an edit into the file's text, which writes it on its own; `before` is the text the change was made to */
	scheduleSave(path: string | null, content: string, before?: string): void;
	/** write immediately, notifying the user; force bypasses the external-write guard (conflict
	 * modal's "keep mine", where the user has seen disk differs and chosen to overwrite) */
	writeNow(path: string, force?: boolean): void;
	/** re-parse into the visual doc after a wholesale source replacement */
	rebuildVisual(): void;
	isVisualMode(): boolean;
	/** the doc's parse just went stale; the collab layer re-parses on the lull */
	noteLocalEdit(): void;
	/** a visual edit is about to go into the file's text */
	beforeLocalEdit?(): void;
	/** the user is typing: a pending mode-switch scroll anchor is moot */
	clearPendingAnchor(): void;
	/** macro-defining text from the main file's include chain, as the parse saw it */
	projectMacros?(): string;
	/** the document a file's text parses to, for the save check; null when it cannot be parsed
	 *  now (a timeout), which leaves the file as serialized. Absent: no save check */
	reparse?(text: string, format: 'tex' | 'md' | 'typ'): Promise<PMNode | null>;
	/** the save check had to write `rewritten` blocks out whole; `difference` says what still
	 *  differs on reopen when even that did not do */
	noteSaveRewrite?(rewritten: number, difference: string | null): void;
	/** the save check could not parse the file in time, so this save went out unchecked */
	noteSaveUnchecked?(path: string): void;
};

/** The file holds a whole place a merge marked, or git still counts it as unmerged and a marker line
 *  is left: reopened after a place was settled by hand with one line missed, it is not done. */
function inMerge(path: string, text: string): boolean {
	if (hasConflictMarkers(text)) return true;
	return hasMarkerLines(text) && unmerged(path);
}

function unmerged(path: string | null): boolean {
	return !!path && gitChanges.current.some((c) => isConflicted(c.x, c.y) && samePath(c.path, path));
}

export class DocumentBuffer {
	path = $state<string | null>(null);
	loadError = $state<string | null>(null);
	/** the file is gone from disk, so what is loaded is empty. Only reachable through a comparison,
	 *  where a deleted file is the thing being looked at rather than a file that failed to open. */
	deletedOnDisk = $state(false);
	/** the file looks binary and was not read; the pane offers to open it as text anyway */
	binaryWarning = $state<{ path: string; size: number } | null>(null);
	encodingIssue = $state<string | null>(null);
	/** the file came in holding places a merge marked, which the visual editor would show as
	 *  stray paragraphs of <<<<<<< and =======. The source editor offers a choice at each, so the
	 *  file stays there until it is opened afresh, even once every place is chosen: flipping to
	 *  the visual editor under the author's last click would be its own surprise. */
	conflicted = $state(false);
	/** marked places still waiting for a choice, counted only in a file that came in with some */
	conflictsLeft = $derived(this.conflicted ? findConflicts(this.buffer).length : 0);
	/** every place chosen, but a marker line left behind (a place settled by hand, one line of it
	 *  missed) while git still counts the file unmerged: Complete Merge refuses the file, so it is not
	 *  done here either. Once the merge is saved, a line like a heading's ======= is the author's */
	strayMarkers = $derived(this.conflicted && this.conflictsLeft === 0 && hasMarkerLines(this.buffer) && unmerged(this.path));

	/** the whole .tex file, as raw text */
	texSource = $state('');
	/** non-.tex text files edit this directly */
	rawContent = $state('');
	docMeta = $state<DocMeta>(null);
	visualDoc = $state<PMNode | null>(null);
	/** the editor's current body doc; needed to re-serialize when an inline preamble-frontmatter
	 * field rewrites the preamble without touching the body */
	lastDoc = $state<PMNode | null>(null);
	/** the texSource `lastDoc` serializes to */
	lastDocSource: string | null = null;
	/** where every run and block of `lastDoc` sits in texSource; empty until a parse has landed */
	sourceMap = $state.raw<SourceMap>(emptyMap());
	/** a re-parse of texSource is in flight: the doc on screen predates it, so its transactions
	 * (node views settling on mount, a keystroke) must not serialize over the newer text */
	visualStale = false;

	eol = $state<Eol>('\n');
	/** the bytes we believe are on disk, for conflict detection and dirty tracking */
	diskBaseline = $state('');

	kind = $derived(fileKind(this.path));

	constructor(private deps: DocumentBufferDeps) {}

	/** the live buffer for whichever kind is open */
	get buffer(): string {
		return hasVisualMode(this.kind) ? this.texSource : this.rawContent;
	}

	/** parses a stretch of the body as the open file was parsed; null for a kind the visual editor does not render */
	get regionParser(): RegionParser | null {
		const kind = this.kind;
		if (kind === 'md') return parseMarkdownRegion;
		if (kind === 'typ') return parseTypstRegion;
		if (kind !== 'tex') return null;
		const macros = this.deps.projectMacros?.() ?? '';
		const preamble = this.docMeta?.preamble ?? '';
		const scan = macros ? `${macros}\n${preamble}` : preamble;
		return (src) => parseLatexRegion(src, scan);
	}

	/** serialize the visual doc back to source in the open file's dialect, with where its runs
	 *  landed; the blocks in `afresh` written whole (see verifiedSerialize) */
	/** the file `doc` would be written as */
	textOf(doc: PMNode): string {
		return this.serializeFile(doc).text;
	}

	private serializeFile(doc: PMNode, afresh?: ReadonlySet<PMNode>): { text: string; map: SourceMap } {
		if (!this.docMeta) return { text: this.texSource, map: this.sourceMap };
		if (this.kind === 'md') return serializeMarkdownFileDetailed(this.docMeta, doc, afresh);
		if (this.kind === 'typ') return serializeTypstFileDetailed(this.docMeta, doc, afresh);
		return serializeLatexFileDetailed(this.docMeta, doc, afresh);
	}

	/**
	 * The save check, run by the save pipeline before `content` goes to disk: when it is what the
	 * visual doc serialized to, it is parsed again and must show what the doc shows; failing that
	 * the changed blocks are written whole (see verifiedSerialize) and the buffers follow, so the
	 * source view shows what was saved. Null keeps the content: a source-mode edit is the truth as
	 * typed, and an edit made while the check ran gets a check of its own
	 */
	async verifyForWrite(path: string, content: string): Promise<string | null> {
		const reparse = this.deps.reparse;
		if (!reparse || !this.docMeta || !this.lastDoc || !hasVisualMode(this.kind)) return null;
		if (path !== this.path || content !== this.texSource || this.lastDocSource !== content) return null;
		const doc = this.lastDoc;
		const format = formatOf(this.kind);
		const verified = await verifiedSerialize({
			format,
			doc,
			first: { text: content, map: this.sourceMap },
			serialize: (d, afresh) => this.serializeFile(d, afresh),
			reparse: (text) => reparse(text, format)
		});
		if (!verified.checked) this.deps.noteSaveUnchecked?.(path);
		if (verified.rung === 0 || this.lastDoc !== doc || this.texSource !== content) return null;
		this.texSource = verified.text;
		this.sourceMap = verified.map;
		this.lastDocSource = verified.text;
		this.deps.noteSaveRewrite?.(verified.rewritten, verified.difference);
		return verified.text;
	}

	/** display name: root-relative when we have a root, else just the basename */
	nameOf(root: string | null): string {
		if (!this.path) return '';
		return root ? relativeTo(root, this.path) : basename(this.path);
	}

	/** drop the open file's buffers. Per-file state must not leak into the next file. */
	close(): void {
		this.texSource = '';
		this.docMeta = null;
		this.visualDoc = null;
		this.lastDoc = null;
		this.lastDocSource = null;
		this.sourceMap = emptyMap();
		this.visualStale = false;
		this.rawContent = '';
		this.path = null;
		this.encodingIssue = null;
		this.conflicted = false;
		this.binaryWarning = null;
	}

	/** install a .tex file's text; the visual doc is cleared and re-parsed separately */
	openTex(path: string, text: string, eol: Eol, issue: string | null = null): void {
		this.eol = eol;
		this.texSource = text;
		this.docMeta = null;
		this.visualDoc = null;
		this.lastDoc = null;
		this.lastDocSource = null;
		this.sourceMap = emptyMap();
		this.visualStale = false;
		this.path = path;
		this.diskBaseline = text;
		this.encodingIssue = issue;
		this.conflicted = inMerge(path, text);
		this.binaryWarning = null;
	}

	/** install a non-.tex text file (.bib and friends), which has no visual representation */
	openRaw(path: string, text: string, eol: Eol, issue: string | null = null): void {
		this.eol = eol;
		this.rawContent = text;
		this.texSource = '';
		this.docMeta = null;
		this.visualDoc = null;
		this.lastDoc = null;
		this.lastDocSource = null;
		this.sourceMap = emptyMap();
		this.visualStale = false;
		this.path = path;
		this.diskBaseline = text;
		this.encodingIssue = issue;
		this.conflicted = inMerge(path, text);
		this.binaryWarning = null;
	}

	/** image / binary / pdf: nothing to load, the viewer just needs the path */
	openOpaque(path: string): void {
		this.close();
		this.path = path;
	}

	/** the probe found bytes text never has: nothing is read until the user asks for it as text */
	openBinaryWarning(path: string, size: number): void {
		this.close();
		this.path = path;
		this.binaryWarning = { path, size };
	}

	private queueSave(text: string, before?: string): void {
		if (this.encodingIssue) return;
		this.deps.scheduleSave(this.path, text, before);
	}

	adoptParsed(parsed: ParsedLatexFile, source: string): void {
		this.docMeta = { preamble: parsed.preamble, postamble: parsed.postamble, hadDocumentEnv: parsed.hadDocumentEnv };
		this.visualDoc = parsed.doc;
		this.lastDoc = parsed.doc;
		this.lastDocSource = source;
		this.sourceMap = parsed.map;
		this.visualStale = false;
		// the citation menu offers what this document's packages define, so it cannot put an
		// undefined command in the source. Merged, not replaced: the other features have owners.
		templateFeaturesStore.current = {
			...templateFeaturesStore.current,
			citationVariants: citationVariantsFor(parsed.preamble),
			hyphenationLanguage: documentHyphenationLanguage(source),
			crossRefNames: crossRefNamesFromPreamble(parsed.preamble),
			refCommands: refCommandsFor(parsed.preamble),
			bibliography: bibliographyKindFor(parsed.preamble),
			macros: scanMacroDefinitions(source)
		};
	}

	/** a visual edit serializes straight into texSource, then saves */
	onVisualChange(doc: PMNode): void {
		if (!this.docMeta || this.visualStale) return;
		this.lastDoc = doc;
		const before = this.texSource;
		this.deps.beforeLocalEdit?.();
		const { text, map } = this.serializeFile(doc);
		this.texSource = text;
		this.sourceMap = map;
		this.lastDocSource = this.texSource;
		// nodeviews settling on load (or an edit undone back to the saved bytes) fire a docChanged
		// transaction that serializes right back to disk: that isn't an unsaved change, and the
		// writer leaves a text equal to disk alone
		if (this.texSource === this.diskBaseline) {
			if (isDirty.current) isDirty.current = false;
			this.queueSave(this.texSource, before);
			return;
		}
		isDirty.current = true;
		this.queueSave(this.texSource, before);
		this.deps.noteLocalEdit();
		this.deps.clearPendingAnchor();
	}

	/** a doc patched in from a collaborator's change that is not the parse's own: its map is of the text
	 *  it writes, and text other than the shared one is an edit of its own */
	restate(doc: PMNode): void {
		if (!this.docMeta) return;
		const before = this.texSource;
		const { text, map } = this.serializeFile(doc);
		this.sourceMap = map;
		this.lastDocSource = text;
		if (text === before) return;
		this.texSource = text;
		isDirty.current = true;
		this.queueSave(text, before);
	}

	/** inline preamble-frontmatter edit (\title/\author/\date): splice the new text into the
	 * preamble verbatim and re-serialize. Anything else in the preamble is Source-view territory. */
	editFrontmatter(kind: string, inner: string): void {
		if (!this.docMeta || !this.lastDoc || this.kind !== 'tex') return; // \title/\author is LaTeX-only
		this.docMeta = { ...this.docMeta, preamble: replacePreambleFrontmatter(this.docMeta.preamble, kind, inner) };
		const before = this.texSource;
		const { text, map } = serializeLatexFileDetailed(this.docMeta, this.lastDoc);
		this.texSource = text;
		this.sourceMap = map;
		this.lastDocSource = this.texSource;
		isDirty.current = true;
		this.queueSave(this.texSource, before);
	}

	/** a source edit IS texSource, write it verbatim */
	onTexInput(v: string): void {
		this.texSource = v;
		isDirty.current = true;
		this.queueSave(v);
	}

	onRawInput(v: string): void {
		this.rawContent = v;
		isDirty.current = true;
		this.queueSave(v);
	}

	/** text arriving from outside the editor - a merge in a terminal, Sync's Combine - that holds
	 *  marked places sends the file to the source editor as opening it would */
	noteConflicts(text: string): void {
		if (hasConflictMarkers(text)) this.conflicted = true;
	}

	/** once every place is chosen, the author may take the file back to the visual editor */
	leaveConflicts(): boolean {
		if (this.conflictsLeft || this.strayMarkers) return false;
		this.conflicted = false;
		return true;
	}

	/** replace the whole source (formatter, disk reload, history step) and re-derive the views */
	replaceSource(text: string, opts: { dirty: boolean }): void {
		const before = this.texSource;
		this.texSource = text;
		this.noteConflicts(text);
		if (opts.dirty) {
			isDirty.current = true;
			this.queueSave(text, before);
		}
		if (this.deps.isVisualMode()) this.deps.rebuildVisual();
	}

	/** Ctrl/Cmd+S: write now instead of after the autosave delay; image and binary kinds have nothing to write */
	save(force = false): void {
		if (!this.path) return;
		if (this.encodingIssue) return;
		if (hasVisualMode(this.kind) || isRawTextKind(this.kind)) this.deps.writeNow(this.path, force);
	}
}
