import type { DocumentHyphenation } from '$lib/editor/visual/linebreak/documentHyphenationLanguage';
import type { CrossRefNames } from '$lib/languages/latex/visual/extensions/drawn/crossRefNames';
import type { MacroDef } from '$lib/editor/source/extensions/math-preview/userMacros';
import { box } from '$lib/runes/box.svelte';
import type { EditorView } from 'prosemirror-view';
import type { EditorView as CodeMirrorView } from '@codemirror/view';
import type { BiblatexReference } from '$lib/languages/bib/biblatex';
import type { EditorConfiguration } from '$lib/types/editorcfg';
import type { UseKind } from '$lib/workspace/edits/renameUses';

export const editorViewStore = box<EditorView | null>(null);
export const displaySearchBarStore = box(false);
// the find switch of a .pdf open as a tab, for the Find command; null while no such tab is up
export const pdfFindToggle = box<(() => void) | null>(null);
// true while a raw-LaTeX CodeMirror block inside the visual editor has focus;
// the toolbar swaps to a raw-LaTeX bar (see Toolbar.svelte)
export const rawEditorActiveStore = box(false);
// routes Insert/Format in menuBarCommands. visual mode always targets the PM doc (a raw CM block
// is still a PM node, inserting LaTeX text into it would get re-parsed away); only source mode
// targets a CodeMirror editor.
export const viewMode = box<'visual' | 'source'>('visual');
// the SourceEditor's CodeMirror view while source mode is active; used by Insert/Format
export const sourceCmView = box<CodeMirrorView | null>(null);
// renames a label, citation key or glossary entry in the open document and its files; set while the workspace is mounted
export const renameEverywhere = box<((kind: UseKind, from: string, to: string) => Promise<void>) | null>(null);
// adds a \usepackage line to a file of the document, the main file for a chapter; set while the workspace is mounted
export const addPackageElsewhere = box<((path: string, name: string) => Promise<void>) | null>(null);
// true when the PM selection is inside a CodeMirror-backed block; the menu bar disables
// Insert/Format there (they would split/convert the block). maintained by createCursorPlugin.
export const cursorInCm = box<boolean>(false);
export const referenceStore = box<BiblatexReference[] | null>(null);
// all \label{} keys in the current file, consumed by \ref/\eqref/\cref autocompletion
export const labelStore = box<string[]>([]);
// workspace files as root-relative forward-slash paths, consumed by file-path autocompletion
export const filePathStore = box<string[]>([]);
export const editorConfigStore = box<EditorConfiguration | null>(null);

export type TemplateFeatures = {
	citations: boolean;
	tableCaption: boolean;
	tableNotes: boolean;
	tableHeaderRow?: boolean; // false hides the "Column headers (first row)" toggle
	tableHeaderColumn?: boolean; // false hides the "Row labels (first column)" toggle
	columnSpanningFigures: boolean; // true shows the "Span columns" toggle for figures/tables
	// citation commands the open document can compile, from its preamble (citationVariantsFor).
	// Names only: the form owns the wording, so a language change is picked up without a reparse.
	// undefined = no preamble seen (an included chapter), so the form narrows nothing.
	citationVariants?: string[];
	// the patterns the visual editor splits words by, from the document's own source. undefined = none named
	hyphenationLanguage?: DocumentHyphenation;
	// the words \cref and \autoref print, the packages' defaults as renamed in the preamble. undefined = the defaults
	crossRefNames?: CrossRefNames;
	// the reference commands the preamble's packages define (refCommandsFor). undefined = no preamble seen, nothing narrowed
	refCommands?: string[];
	// the reference commands the loaded files give a star (starredRefCommands). undefined = no preamble seen
	refStars?: string[];
	// how the preamble prints its bibliography (bibliographyKindFor). undefined = no preamble seen
	bibliography?: 'biblatex' | 'bibtex';
	// the .bst styles the loaded files provide, then the common ones. undefined = no preamble seen
	bibStyles?: string[];
	// the macros the document defines itself, by name without the backslash; the project's others are in projectIntel
	macros?: Record<string, MacroDef>;
	highlight?: boolean; // false: highlight won't appear in the final document (user sees warning)
	textColor?: boolean; // false: text color won't appear in the final document (user sees warning)
};

const DEFAULT_TEMPLATE_FEATURES: TemplateFeatures = {
	citations: true,
	tableCaption: true,
	tableNotes: true,
	tableHeaderRow: true,
	tableHeaderColumn: true,
	columnSpanningFigures: false,
	highlight: true,
	textColor: true
	// citationVariants omitted = default biblatex options
};

export const templateFeaturesStore = box<TemplateFeatures>(DEFAULT_TEMPLATE_FEATURES);
