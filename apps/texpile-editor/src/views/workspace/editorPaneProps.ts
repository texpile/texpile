// what WorkspaceMain hands EditorPane; a types file so the surface component stays legible
import type { Node as PMNode } from 'prosemirror-model';
import type { ComponentProps } from 'svelte';
import type SourceEditor from '$lib/editor/source/SourceEditor.svelte';
import type { EditSession } from '$lib/collab/editSession';
import type { ParsedLatexFile, ParsePhase } from '$lib/workspace/latexRoundtrip';
import type { BiblatexReference } from '$lib/workspace/citations';
import type { Starter, ImportedFile } from '$lib/workspace/starters';
import type { FileKind } from '$lib/workspace/documentBuffer.svelte';
import type { Tab, CompareRef } from '$lib/workspace/tabs.svelte';
import type { CommentAnchor } from '$lib/comments/anchor';

export type EditorPaneProps = {
	loadedPath: string | null;
	openTabs: Tab[];
	/** key of the focused tab; a file and a comparison of it are two different keys */
	activeTabKey: string | null;
	/** the unedited preview tab's key, if any (see TabsStore.preview) */
	previewTab: string | null;
	onActivateTab: (tab: Tab) => void;
	onCloseTab: (tab: Tab) => void;
	onKeepTab: (tab: Tab) => void;
	kind: FileKind;
	/** a shared session serves this file by name only (no body): show a note, not an empty editor */
	nameOnly?: boolean;
	viewMode: 'visual' | 'source' | 'diff';
	session: EditSession;
	folderEmpty: boolean;
	loadError: string | null;
	/** the working copy is gone from disk; only reachable inside a comparison */
	fileDeleted?: boolean;
	applyingStarter: boolean;
	texSource: string;
	rawContent: string;
	visualDoc: PMNode | null;
	/** stage of the in-flight parse, for the visual-mode loading bar; null = idle */
	parseProgress?: ParsePhase | null;
	/** escape hatch offered once the parse looks slow */
	onUseSource?: () => void;
	docMeta: Pick<ParsedLatexFile, 'preamble' | 'postamble' | 'hadDocumentEnv'> | null;
	allReferences: BiblatexReference[];
	sourceGotoLine: { line: number; token: number; selectText?: string } | undefined;
	sourceScrollAnchor: { scroll: number | null; cursor: number | null } | null;
	sourceDiagnostics: NonNullable<ComponentProps<typeof SourceEditor>['diagnostics']>;
	diffOriginal: string;
	diffModified: string;
	diffLayout: 'unified' | 'split';
	diffLoading: boolean;
	diffError: string | null;
	diffHasHead: boolean;
	/** the version the diff compares against; null means the last saved one */
	diffCompareRef: { hash: string; subject: string } | null;
	/** that version parsed, for the VISUAL diff: it compares documents, not sources */
	diffVersionDoc: PMNode | null;
	/** its preamble, which sits outside the body and so cannot show up in a document diff */
	diffVersionPreamble: string | null;
	/** the version would not parse, so there is no visual diff to draw for it */
	diffVersionUnavailable: boolean;
	/** set when the FOCUSED TAB is a comparison: the pane renders a diff instead of the document.
	 *  Orthogonal to viewMode, which stays visual/source and applies inside either. */
	compare: CompareRef | null;
	/** the workspace provider's URL builder: guests resolve through the session, not disk */
	fileUrl: (path: string) => string;
	onPickStarter: (s: Starter) => void;
	onBlankStarter: () => void;
	onImportStarter: (files: ImportedFile[]) => void;
	onTexInput: (v: string) => void;
	onRawInput: (v: string) => void;
	onVisualChange: (doc: PMNode) => void;
	/** visual-editor caret movement (shared-session presence). */
	onVisualSelection?: () => void;
	onEditFrontmatter: (kind: string, inner: string) => void;
	/** absent when no preview target can resolve the jump (WorkspaceMain's canSync gate) */
	onSyncToPdf?: (line: number) => void;
	onHistoryBoundary: (dir: 'undo' | 'redo') => boolean;
	onJumpToFile: (name: string) => void;
	onOpenFileAt: (file: string, line: number, selectText?: string) => void;
	/** caret moved to this ZERO-based line/column in the source editor */
	onCaretMove?: (line: number, character: number) => void;
	/** review-comment ranges for the open file, and the hooks the editor raises; see lib/comments */
	commentRanges?: import('$lib/editor/visual/extensions/comments').CommentRange[];
	/** the same file's threads with their anchors: the visual editor re-resolves against its own
	 * rendered text, because source offsets mean nothing there (see pmComments) */
	commentThreads?: import('$lib/comments/log').CommentThread[];
	selectedComment?: string | null;
	onAddComment?: (from: number, to: number) => void;
	/** pick citations from Zotero and insert them at the caret (host + desktop only) */
	onInsertCitation?: () => void;
	/** pick citations from the personal library and insert them at the caret (host + desktop only) */
	onInsertLibraryCitation?: () => void;
	/** the visual editor's add: it hands a finished rendered-dialect anchor, not source offsets */
	onAddCommentAnchored?: (anchor: import('$lib/comments/anchor').CommentAnchor | null) => void;
	/** threads the visual editor could not draw, so the panel can label them "not in this view" */
	onCommentsPlaced?: (lost: string[]) => void;
	/** a comment composer is open; keeps the commented selection tinted in the visual editor */
	commentPendingActive?: boolean;
	onSelectComment?: (id: string, from: 'text' | 'gutter' | 'visual') => void;

	onToggleDiffLayout: () => void;
	onRefreshDiff: () => void;
	onExitDiff: () => void;
};
