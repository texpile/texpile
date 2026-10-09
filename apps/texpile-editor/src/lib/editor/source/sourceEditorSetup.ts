// Assembles the CodeMirror extension stack for SourceEditor, and routes the language mode
// by file extension once the view exists.
import {
	EditorView,
	keymap,
	drawSelection,
	tooltips,
	lineNumbers,
	highlightActiveLine,
	rectangularSelection,
	crosshairCursor
} from '@codemirror/view';
import type { ViewUpdate } from '@codemirror/view';
import { EditorState, type Compartment, type Extension } from '@codemirror/state';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, codeFolding, indentOnInput, foldGutter, LanguageDescription } from '@codemirror/language';
import { cmSyntaxHighlight } from '$lib/editor/source/cmHighlight';
import { languages as cmlangdata } from '@codemirror/language-data';
import { searchKeymap } from '@codemirror/search';
import { closeSearchPanelAnimated, texpileSearch, toggleSearchPanel } from '$lib/editor/source/extensions/search-panel/searchPanel.svelte';
import { latexAutocomplete, latexIntellisense } from '$lib/languages/latex/intellisense/intellisense';
import { foldMarkerDom, foldMarkerTheme } from '$lib/languages/latex/intellisense/fold';
import { mdSourceShortcuts } from '$lib/languages/markdown/source/sourceExtensions';
import { typSourceShortcuts } from '$lib/languages/typst/source/sourceExtensions';
import { typstEnterContinuation } from '$lib/languages/typst/source/enterContinuation';
import { typstGoTo } from '$lib/languages/typst/intellisense/actions/goToDefinition';
import { createProjectFile, typstQuickFix } from '$lib/languages/typst/intellisense/actions/quickFix';
import { typstColorSwatches } from '$lib/languages/typst/intellisense/actions/colorSwatches';
import { guestSession } from '$lib/collab/guestSession';
import { mdPathCompletion } from '$lib/languages/markdown/pathCompletion';
import { cmSpellcheck } from '$lib/editor/spellcheck/cmSpellcheck';
import type { SpellLanguage } from '$lib/editor/spellcheck/languages/spellLanguages';
import { lintGutter } from '@codemirror/lint';
import { comments, commentGutterHandlers } from '$lib/editor/visual/extensions/comments';
import { mathPreview } from '$lib/editor/source/extensions/math-preview/mathPreview';
import { starterGhost } from '$lib/editor/source/extensions/starter-ghost/starterGhost';
import { flashLineEffect, synctexFlash } from '$lib/languages/latex/source/synctexFlash';
import { latexListContinuation } from '$lib/languages/latex/source/listContinuation';
import { bibtex } from '$lib/languages/bib/bibtexLanguage';
import { latex } from '$lib/languages/latex/source/latexLanguage';
import { caretDoctor } from '$lib/debug/caretDoctor';
import { m } from '$lib/paraglide/messages';
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next';
import type * as Y from 'yjs';
import { gutterTheme, yRemoteLayoutFix } from './sourceEditorThemes';
import type { CollabBinding } from './sourceEditorTypes';
import { tocCaretListener } from '$lib/editor/visual/extensions/tableofcontents/tocCaretListener';
import { cmConflicts } from './cmConflicts';
import { cmChangeMarkers } from './cmChangeMarkers';
import { sourcePaste } from './paste/cmSourcePaste';
import type { PasteDialect } from '$lib/editor/paste/pastedImages';
import { dirname } from '$lib/workspace/fileSystem';
import { foldMemory } from './extensions/fold-memory/foldMemory';

export type SourceSetupDeps = {
	fileFor: string;
	/** the file whose folds are remembered, as its place is; none in a shared session, where neither is ours */
	foldsOf?: string | null;
	collab: CollabBinding | null;
	undoManager: Y.UndoManager | null;
	langConf: Compartment;
	roConf: Compartment;
	wrapConf: Compartment;
	lspConf: Compartment;
	keymapConf: Compartment;
	lineWrap: boolean;
	readOnly?: boolean;
	/** the language the file's text is checked in; read at each check, as the text can change it */
	spellLanguage: (source: string) => SpellLanguage | null;
	onAddComment?: (from: number, to: number) => void;
	onSelectComment?: (id: string) => void;
	/** the thread behind a comment id, for the hover card over its text and line number */
	onJumpToFile?: (name: string) => void;
	onOpenFileAt?: (file: string, line: number) => void;
	onScroll: () => void;
	updateListener: (u: ViewUpdate) => void;
};

function pasteDialectOf(fileFor: string): PasteDialect | null {
	if (/\.tex$/i.test(fileFor)) return 'latex';
	if (/\.typ$/i.test(fileFor)) return 'typst';
	return /\.(md|markdown)$/i.test(fileFor) ? 'markdown' : null;
}

export function buildSourceExtensions(deps: SourceSetupDeps): Extension[] {
	const { fileFor, collab, onAddComment, onSelectComment } = deps;
	const pasteDialect = pasteDialectOf(fileFor);
	return [
		// gutters render in extension order: lint goes before lineNumbers so it lands on their left
		...(!fileFor || /\.(tex|typ)$/i.test(fileFor) ? [lintGutter({ hoverTime: 0 })] : []),
		// mounted only where the caller wants comments, so a standalone editor grows no gutter
		// column for a feature nothing feeds. Suggestions ride in here too, and a file whose editor
		// skips it still stages them, with nothing drawn to say so
		...(onAddComment
			? [
					comments({
						onAdd: (from, to) => onAddComment?.(from, to),
						onSelect: (id) => onSelectComment?.(id),
						addLabel: m.comments_add()
					})
				]
			: []),
		// the comment mark rides these cells (gutterLineClass), so the click on it has to be
		// handled by the gutter that owns them - EditorView.domEventHandlers only sees the text
		lineNumbers(onSelectComment ? { domEventHandlers: commentGutterHandlers((id) => onSelectComment(id)) } : {}),
		// between the numbers and the text, where VS Code puts them; nothing is drawn until the last
		// saved version's text arrives
		...(deps.readOnly ? [] : [cmChangeMarkers()]),
		gutterTheme,
		// middle dots, which the monospace fonts carry, each centered in its cell; a ⋯ falls back to a font set off center
		codeFolding({ placeholderText: '···' }),
		...(deps.foldsOf ? [foldMemory(deps.foldsOf)] : []),
		highlightActiveLine(),
		...(collab ? [yCollab(collab.ytext, collab.awareness, { undoManager: deps.undoManager! }), yRemoteLayoutFix] : []),
		deps.roConf.of(deps.readOnly || collab?.readOnly ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : []),
		// what a merge left marked, with a choice at each place; a read-only view has no choice to offer
		...(deps.readOnly || collab?.readOnly ? [] : [cmConflicts()]),
		deps.keymapConf.of([]),
		drawSelection(),
		// tooltips fit in the editor, not the window: tinymist's hover sits above its line and otherwise
		// covered the toolbar, under the toolbar's own layer
		tooltips({ tooltipSpace: (view) => view.scrollDOM.getBoundingClientRect() }),
		// multiple cursors: the keymaps already bind the commands, but every transaction is
		// normalized down to one range until the state allows extra ones
		EditorState.allowMultipleSelections.of(true),
		rectangularSelection(),
		crosshairCursor(),
		bracketMatching(),
		indentOnInput(),
		deps.langConf.of([]),
		cmSyntaxHighlight(),
		// guests included: the sources read stores fed through the workspace provider, so a
		// session serves them from the shared doc
		// .bbl rides the LaTeX lane (its entries are LaTeX text) minus the starter ghost, which
		// offers a fresh-document skeleton a bibliography must never get
		...(!fileFor || /\.(tex|bbl)$/i.test(fileFor)
			? [
					latexIntellisense({ onJumpToFile: deps.onJumpToFile, onOpenFileAt: deps.onOpenFileAt }),
					// ahead of defaultKeymap below, so Enter reaches it first; it declines
					// everywhere except inside a list item and Enter then behaves normally
					latexListContinuation(),
					mathPreview(),
					...(!fileFor || /\.tex$/i.test(fileFor) ? [starterGhost()] : []),
					cmSpellcheck(deps.spellLanguage)
				]
			: /\.(md|markdown)$/i.test(fileFor)
				? // md chords; $-math, spellcheck and project file paths are dialect-free
					// the fold rail as .tex and .typ have it; lang-markdown already folds a heading's section
					[
						mdSourceShortcuts(),
						mdPathCompletion(),
						mathPreview({ comments: false }),
						cmSpellcheck(deps.spellLanguage),
						foldGutter({ markerDOM: foldMarkerDom }),
						foldMarkerTheme
					]
				: /\.bib$/i.test(fileFor)
					? [latexAutocomplete({ bib: true })]
					: /\.typ$/i.test(fileFor)
						? // completion/hover/diagnostics arrive over LSP, filled into lspConf below. the fold
							// RAIL is mounted here rather than with the language, whose parser is a dynamic
							// import: a gutter arriving a second late shoves the text sideways on every open
							[
								typSourceShortcuts(),
								// ahead of defaultKeymap below, as latexListContinuation is
								typstEnterContinuation(),
								// server-backed, so inert until the LSP extension lands in lspConf
								typstGoTo({ onOpenFileAt: deps.onOpenFileAt, flash: (pos) => flashLineEffect.of(pos) }),
								// a guest's missing file would be created on its own disk, not the project's
								typstQuickFix({ onCreateFile: guestSession.active ? undefined : createProjectFile }),
								typstColorSwatches(),
								cmSpellcheck(deps.spellLanguage, 'typst'),
								foldGutter({ markerDOM: foldMarkerDom }),
								foldMarkerTheme
							]
						: []),
		deps.lspConf.of([]),
		...(pasteDialect
			? [
					sourcePaste({
						dialect: pasteDialect,
						imageDir: () => dirname(fileFor) || null,
						stopUndoCapture: () => deps.undoManager?.stopCapturing()
					})
				]
			: []),
		synctexFlash(), // flash the line jumped to by SyncTeX inverse search / Find-in-Files
		// compact find/replace widget, floated top-right (styles in SourceEditor)
		texpileSearch(),
		keymap.of([
			{ key: 'Mod-f', run: toggleSearchPanel },
			{ key: 'Escape', run: closeSearchPanelAnimated },
			...defaultKeymap,
			// the file's history, which the visual editor and the disk share; a view with no text binding is read-only
			...(collab ? yUndoManagerKeymap : []),
			...searchKeymap,
			indentWithTab
		]),
		deps.wrapConf.of(deps.lineWrap ? EditorView.lineWrapping : []),
		// opt-in diagnostic for "the caret moved and I didn't move it"; see caretDoctor
		caretDoctor(),
		EditorView.contentAttributes.of({ spellcheck: 'false', 'data-gramm': 'false', 'data-enable-grammarly': 'false' }),
		// scrolling produces no ViewUpdate at all, so the update listener below never sees it
		EditorView.domEventHandlers({ scroll: () => deps.onScroll() }),
		EditorView.updateListener.of(deps.updateListener),
		tocCaretListener
	];
}

// language-data ships no .bib mode, and its LaTeX descriptor matches only .tex/.ltx, so
// .cls/.sty/.bbl are routed by hand rather than through matchFilename. an accessor, not the view:
// the async loads must not dispatch into an editor destroyed while they resolved
export function applySourceLanguage(getView: () => EditorView | null, fileFor: string, langConf: Compartment): void {
	if (fileFor && /\.bib$/i.test(fileFor)) {
		getView()?.dispatch({ effects: langConf.reconfigure(bibtex()) });
	} else if (fileFor && /\.typ$/i.test(fileFor)) {
		// the typst-syntax crate as wasm, dynamically imported: ~310KB nothing else needs
		void import('$lib/languages/typst/source/typstLanguage').then(({ typstLanguage }) =>
			getView()?.dispatch({ effects: langConf.reconfigure(typstLanguage()) })
		);
	} else if (!fileFor || /\.(tex|cls|sty|bbl)$/i.test(fileFor)) {
		// ours, not language-data's stex, which files nearly everything under a tag the shared
		// style leaves uncoloured
		getView()?.dispatch({ effects: langConf.reconfigure(latex()) });
	} else {
		const desc = LanguageDescription.matchFilename(cmlangdata, fileFor);
		desc?.load().then((lang) => getView()?.dispatch({ effects: langConf.reconfigure(lang) }));
	}
}
