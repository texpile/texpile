// Assembles the CodeMirror extension stack for SourceEditor, and routes the language mode
// by file extension once the view exists.
import {
	EditorView,
	keymap,
	drawSelection,
	lineNumbers,
	highlightActiveLine,
	rectangularSelection,
	crosshairCursor
} from '@codemirror/view';
import type { ViewUpdate } from '@codemirror/view';
import { EditorState, type Compartment, type Extension } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput, foldGutter, LanguageDescription } from '@codemirror/language';
import { cmSyntaxHighlight } from '$lib/editor/source/cmHighlight';
import { languages as cmlangdata } from '@codemirror/language-data';
import { searchKeymap } from '@codemirror/search';
import { closeSearchPanelAnimated, texpileSearch, toggleSearchPanel } from '$lib/editor/source/extensions/search-panel/searchPanel.svelte';
import { latexAutocomplete, latexIntellisense } from '$lib/languages/latex/intellisense/intellisense';
import { foldMarkerDom, foldMarkerTheme } from '$lib/languages/latex/intellisense/fold';
import { mdSourceShortcuts } from '$lib/languages/markdown/source/sourceExtensions';
import { typSourceShortcuts } from '$lib/languages/typst/source/sourceExtensions';
import { mdPathCompletion } from '$lib/languages/markdown/pathCompletion';
import { cmSpellcheck } from '$lib/editor/spellcheck/cmSpellcheck';
import { lintGutter } from '@codemirror/lint';
import { comments, commentGutterHandlers } from '$lib/editor/visual/extensions/comments';
import { mathPreview } from '$lib/editor/source/extensions/math-preview/mathPreview';
import { starterGhost } from '$lib/editor/source/extensions/starter-ghost/starterGhost';
import { synctexFlash } from '$lib/languages/latex/source/synctexFlash';
import { latexListContinuation } from '$lib/languages/latex/source/listContinuation';
import { bibtex } from '$lib/languages/bib/bibtexLanguage';
import { latex } from '$lib/languages/latex/source/latexLanguage';
import { caretDoctor } from '$lib/debug/caretDoctor';
import { m } from '$lib/paraglide/messages';
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next';
import type * as Y from 'yjs';
import { gutterTheme, yRemoteLayoutFix } from './sourceEditorThemes';
import type { CollabBinding } from './sourceEditorTypes';

export type SourceSetupDeps = {
	fileFor: string;
	collab: CollabBinding | null;
	undoManager: Y.UndoManager | null;
	langConf: Compartment;
	roConf: Compartment;
	wrapConf: Compartment;
	lspConf: Compartment;
	keymapConf: Compartment;
	lineWrap: boolean;
	readOnly?: boolean;
	onAddComment?: (from: number, to: number) => void;
	onSelectComment?: (id: string, from: 'text' | 'gutter') => void;
	onJumpToFile?: (name: string) => void;
	onOpenFileAt?: (file: string, line: number) => void;
	onHistoryBoundary?: (dir: 'undo' | 'redo') => boolean;
	onScroll: () => void;
	updateListener: (u: ViewUpdate) => void;
};

export function buildSourceExtensions(deps: SourceSetupDeps): Extension[] {
	const { fileFor, collab, onAddComment, onSelectComment, onHistoryBoundary } = deps;
	return [
		// gutters render in extension order: lint goes before lineNumbers so it lands on their left
		...(!fileFor || /\.(tex|typ)$/i.test(fileFor) ? [lintGutter({ hoverTime: 0 })] : []),
		// mounted only where the caller wants comments, so .bib and plain-text editors do not
		// grow a gutter column for a feature they never show
		...(onAddComment
			? [
					comments({
						onAdd: (from, to) => onAddComment?.(from, to),
						onSelect: (id, from) => onSelectComment?.(id, from),
						addLabel: m.comments_add()
					})
				]
			: []),
		// the comment mark rides these cells (gutterLineClass), so the click on it has to be
		// handled by the gutter that owns them - EditorView.domEventHandlers only sees the text
		lineNumbers(onSelectComment ? { domEventHandlers: commentGutterHandlers((id) => onSelectComment(id, 'gutter')) } : {}),
		gutterTheme,
		highlightActiveLine(),
		...(collab ? [yCollab(collab.ytext, collab.awareness, { undoManager: deps.undoManager! }), yRemoteLayoutFix] : [history()]),
		deps.roConf.of(deps.readOnly || collab?.readOnly ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : []),
		deps.keymapConf.of([]),
		drawSelection(),
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
					cmSpellcheck()
				]
			: /\.(md|markdown)$/i.test(fileFor)
				? // md chords; $-math, spellcheck and project file paths are dialect-free
					[mdSourceShortcuts(), mdPathCompletion(), mathPreview(), cmSpellcheck()]
				: /\.bib$/i.test(fileFor)
					? [latexAutocomplete({ bib: true })]
					: /\.typ$/i.test(fileFor)
						? // completion/hover/diagnostics arrive over LSP, filled into lspConf below. the fold
							// RAIL is mounted here rather than with the language, whose parser is a dynamic
							// import: a gutter arriving a second late shoves the text sideways on every open
							[typSourceShortcuts(), cmSpellcheck('typst'), foldGutter({ markerDOM: foldMarkerDom }), foldMarkerTheme]
						: []),
		deps.lspConf.of([]),
		synctexFlash(), // flash the line jumped to by SyncTeX inverse search / Find-in-Files
		// compact find/replace widget, floated top-right (styles in SourceEditor)
		texpileSearch(),
		keymap.of([
			{ key: 'Mod-f', run: toggleSearchPanel },
			{ key: 'Escape', run: closeSearchPanelAnimated },
			...defaultKeymap,
			...(collab ? yUndoManagerKeymap : historyKeymap),
			...searchKeymap,
			indentWithTab
		]),
		// lower precedence than historyKeymap, so CM's own undo/redo runs first; these fire only
		// when it's exhausted and the workspace snapshot history takes over. consume the key even
		// at the stack edge: a failed redo falling through to another binding is worse than a no-op.
		// collab mode: the CRDT undo manager owns the whole stack, never fall through.
		keymap.of(
			collab
				? []
				: [
						{ key: 'Mod-z', run: () => (onHistoryBoundary ? (onHistoryBoundary('undo'), true) : false) },
						{ key: 'Mod-y', run: () => (onHistoryBoundary ? (onHistoryBoundary('redo'), true) : false) },
						{ key: 'Mod-Shift-z', run: () => (onHistoryBoundary ? (onHistoryBoundary('redo'), true) : false) }
					]
		),
		deps.wrapConf.of(deps.lineWrap ? EditorView.lineWrapping : []),
		// opt-in diagnostic for "the caret moved and I didn't move it"; see caretDoctor
		caretDoctor(),
		EditorView.contentAttributes.of({ spellcheck: 'false', 'data-gramm': 'false', 'data-enable-grammarly': 'false' }),
		// scrolling produces no ViewUpdate at all, so the update listener below never sees it
		EditorView.domEventHandlers({ scroll: () => deps.onScroll() }),
		EditorView.updateListener.of(deps.updateListener)
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
