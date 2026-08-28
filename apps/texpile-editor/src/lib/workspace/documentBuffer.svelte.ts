// The open file's buffers, and every way they can be edited.
//
// For a .tex file `texSource` is the single source of truth: the whole file, as raw text. The
// visual editor is a VIEW over it - entry parses into `visualDoc` + `docMeta`, every visual edit
// serializes straight back into `texSource`, and source mode binds to it directly. No rival copy
// can drift. Non-.tex text files bypass all that and edit `rawContent` directly.
import { isDirty } from '$lib/workspace/workspaceStore';
import { serializeLatexFile, type ParsedLatexFile } from '$lib/workspace/latexRoundtrip';
import { serializeMarkdownFile } from '$lib/languages/markdown/visual/roundtrip';
import { serializeTypstFile } from '$lib/languages/typst/visual/roundtrip';
import { replacePreambleFrontmatter } from '$lib/editor/visual/extensions/raw-latex/frontmatterView';
import { basename, relativeTo, type Eol } from '$lib/workspace/fileSystem';
import { sourceEncodingError } from '$lib/workspace/sourceEncoding';
import { citationVariantsFor } from '$lib/languages/latex/visual/extensions/citation/citationVariantsFor';
import { templateFeaturesStore } from '$lib/stores/editorStore';
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
	/** queue a debounced write of the given content */
	scheduleSave(path: string | null, content: string): void;
	/** drop a queued write (the buffer already matches disk) */
	discardQueuedSave(): void;
	/** write immediately, notifying the user; force bypasses the external-write guard (conflict
	 * modal's "keep mine", where the user has seen disk differs and chosen to overwrite) */
	writeNow(path: string, content: string, force?: boolean): void;
	/** re-parse into the visual doc after a wholesale source replacement */
	rebuildVisual(): void;
	isVisualMode(): boolean;
	/** the doc's orig stamps just went stale; the collab layer re-stamps on the lull */
	noteLocalEdit(): void;
	/** the user is typing: a pending mode-switch scroll anchor is moot */
	clearPendingAnchor(): void;
};

export class DocumentBuffer {
	path = $state<string | null>(null);
	loadError = $state<string | null>(null);
	/** the file is gone from disk, so what is loaded is empty. Only reachable through a comparison,
	 *  where a deleted file is the thing being looked at rather than a file that failed to open. */
	deletedOnDisk = $state(false);
	encodingIssue = $state<string | null>(null);

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

	eol = $state<Eol>('\n');
	/** the bytes we believe are on disk, for conflict detection and dirty tracking */
	diskBaseline = $state('');

	kind = $derived(fileKind(this.path));

	constructor(private deps: DocumentBufferDeps) {}

	/** the live buffer for whichever kind is open */
	get buffer(): string {
		return hasVisualMode(this.kind) ? this.texSource : this.rawContent;
	}

	/** serialize the visual doc back to source in the open file's dialect */
	private serializeFile(doc: PMNode): string {
		if (!this.docMeta) return this.texSource;
		if (this.kind === 'md') return serializeMarkdownFile(this.docMeta, doc);
		if (this.kind === 'typ') return serializeTypstFile(this.docMeta, doc);
		return serializeLatexFile(this.docMeta, doc);
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
		this.rawContent = '';
		this.path = null;
		this.encodingIssue = null;
	}

	/** install a .tex file's text; the visual doc is cleared and re-parsed separately */
	openTex(path: string, text: string, eol: Eol): void {
		this.eol = eol;
		this.texSource = text;
		this.docMeta = null;
		this.visualDoc = null;
		this.lastDoc = null;
		this.lastDocSource = null;
		this.path = path;
		this.diskBaseline = text;
		this.encodingIssue = sourceEncodingError(text);
	}

	/** install a non-.tex text file (.bib and friends), which has no visual representation */
	openRaw(path: string, text: string, eol: Eol): void {
		this.eol = eol;
		this.rawContent = text;
		this.texSource = '';
		this.docMeta = null;
		this.visualDoc = null;
		this.lastDoc = null;
		this.lastDocSource = null;
		this.path = path;
		this.diskBaseline = text;
		this.encodingIssue = sourceEncodingError(text);
	}

	/** image / binary / pdf: nothing to load, the viewer just needs the path */
	openOpaque(path: string): void {
		this.close();
		this.path = path;
	}

	private queueSave(text: string): void {
		if (this.encodingIssue) return;
		this.deps.scheduleSave(this.path, text);
	}

	adoptParsed(parsed: ParsedLatexFile, source: string): void {
		this.docMeta = { preamble: parsed.preamble, postamble: parsed.postamble, hadDocumentEnv: parsed.hadDocumentEnv };
		this.visualDoc = parsed.doc;
		this.lastDoc = parsed.doc;
		this.lastDocSource = source;
		// the citation menu offers what this document's packages define, so it cannot put an
		// undefined command in the source. Merged, not replaced: the other features have owners.
		templateFeaturesStore.current = {
			...templateFeaturesStore.current,
			citationVariants: citationVariantsFor(parsed.preamble)
		};
	}

	/** a visual edit serializes straight into texSource, then saves */
	onVisualChange(doc: PMNode): void {
		if (!this.docMeta) return;
		this.lastDoc = doc;
		this.texSource = this.serializeFile(doc);
		this.lastDocSource = this.texSource;
		// nodeviews settling on load (or an edit undone back to the saved bytes) fire a docChanged
		// transaction that serializes right back to disk: that isn't an unsaved change, so don't
		// flag the pristine file dirty or queue a no-op save that would nag on the next switch
		if (this.texSource === this.diskBaseline) {
			if (isDirty.current) isDirty.current = false;
			this.deps.discardQueuedSave();
			return;
		}
		isDirty.current = true;
		this.queueSave(this.texSource);
		this.deps.noteLocalEdit();
		this.deps.clearPendingAnchor();
	}

	/** inline preamble-frontmatter edit (\title/\author/\date): splice the new text into the
	 * preamble verbatim and re-serialize. Anything else in the preamble is Source-view territory. */
	editFrontmatter(kind: string, inner: string): void {
		if (!this.docMeta || !this.lastDoc || this.kind !== 'tex') return; // \title/\author is LaTeX-only
		this.docMeta = { ...this.docMeta, preamble: replacePreambleFrontmatter(this.docMeta.preamble, kind, inner) };
		this.texSource = serializeLatexFile(this.docMeta, this.lastDoc);
		this.lastDocSource = this.texSource;
		isDirty.current = true;
		this.queueSave(this.texSource);
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

	/** replace the whole source (formatter, disk reload, history step) and re-derive the views */
	replaceSource(text: string, opts: { dirty: boolean }): void {
		this.texSource = text;
		if (opts.dirty) {
			isDirty.current = true;
			this.queueSave(text);
		}
		if (this.deps.isVisualMode()) this.deps.rebuildVisual();
	}

	/** manual save (Ctrl/Cmd+S or the Save button); autosave handles the rest.
	 * image / binary kinds have nothing to write. */
	save(force = false): void {
		this.deps.discardQueuedSave(); // drop the queued debounce; we're writing the current content now
		if (!this.path) return;
		if (this.encodingIssue) return;
		if (hasVisualMode(this.kind)) this.deps.writeNow(this.path, this.texSource, force);
		else if (isRawTextKind(this.kind)) this.deps.writeNow(this.path, this.rawContent, force);
	}
}
