<script lang="ts">
	import ContextMenu from './comp/toolbar/ContextMenu.svelte';
	import { onDestroy, onMount } from 'svelte';
	import { EditorState, Transaction, TextSelection } from 'prosemirror-state';
	import { EditorView } from 'prosemirror-view';
	import type { Node as PMNode } from 'prosemirror-model';
	import { schema } from '../schema/schema';
	import { isMac } from '$lib/platform';
	import { keymap } from 'prosemirror-keymap';
	import { baseKeymap, toggleMark } from 'prosemirror-commands';
	import { undo as historyUndo, redo as historyRedo, history } from 'prosemirror-history';
	import { toggleBlockQuote, toggleHeading, cycleParagraphIndent } from './helperCommands';
	import { gapCursor } from 'prosemirror-gapcursor';
	import { createMathField } from './extensions/mathlivebridge/mlcommands';
	import { createCodeBlock } from './extensions/codemirrorbridge/cmcommands';
	import { cmarrowHandlers } from './extensions/codemirrorbridge/cmarrowhandler';
	import { editorViewStore, referenceStore } from '../stores/editorStore';
	import { preferences } from '$lib/stores/preferencesStore.svelte';
	import { menuUpdatePlugin } from './extensions/toolbarlistenerplugin';
	import { dropCursor } from 'prosemirror-dropcursor';
	import { columnResizing, fixTables, tableEditing, goToNextCell } from 'prosemirror-tables';
	import 'prosemirror-view/style/prosemirror.css';
	import 'prosemirror-tables/style/tables.css';
	import 'prosemirror-gapcursor/style/gapcursor.css';
	import './extensions/image/styles/common.css';
	import './extensions/image/styles/withResize.css';
	import './extensions/image/styles/sideResize.css';
	import { imagePlugin } from './extensions/image';
	import { createCursorPlugin } from './extensions/cursor-plugin';
	import { pasteUUIDFixPlugin } from './extensions/paste-uuid-fix';
	import { latexClipboardPlugin } from './extensions/latexClipboard';
	import './styles/cursor.css';
	import { createListPlugins, listInputRules, listKeymap } from 'prosemirror-flat-list';
	import { inputRules, InputRule, smartQuotes, ellipsis, undoInputRule } from 'prosemirror-inputrules';
	import 'prosemirror-flat-list/dist/style.css';
	import { placeholderPlugin } from './extensions/placeholderplugin';
	import { tablePlaceholderPlugin } from './extensions/table/tablePlaceholderPlugin';
	import { suggestionModePlugin, suggestionHoverPlugin, suggestionNodeDecoPlugin } from './extensions/suggestion-mode';
	import { search } from 'prosemirror-search';
	import 'prosemirror-search/style/search.css';
	import { tableOfContentsPlugin } from './extensions/tableofcontent/tocplugin';
	import CitationView from './extensions/citation/citationView.svelte';
	import RefView from './extensions/ref/refView.svelte';
	import { createRefUpdatePlugin } from './extensions/ref/refUpdatePlugin';
	import { createTocPlugin } from './extensions/tableofcontents/tocPlugin';
	import { createPersistentSelectionPlugin } from './extensions/persistentSelection/persistentSelectionPlugin';
	import { createSuggestPlugin } from './extensions/suggest/suggestPlugin';
	import { proofreadPlugin } from './extensions/spellcheck/spellcheckplugin';
	import { createTemplateEditorSettings, createLocalImageSettings } from './extensions/image/imageplugin.svelte';
	import { createWordCountPlugin } from './extensions/wordcount/wordCountPlugin';
	import { emDashRule, enDashRule, emDashUpgradeRule } from './extensions/inputrules/dashRules';
	import tableWrapperView from './extensions/table/tableWrapperView.svelte';
	import CodeBlockView from './extensions/codemirrorbridge/cmview';
	import RawLatexView from './extensions/raw-latex/rawLatexView';
	import { RawFigureView, isRawFigure } from './extensions/raw-latex/rawFigureView';
	import { IEEEAuthorView, isIEEEAuthorBlock } from './extensions/template-specific/ieeeAuthorView';
	import InlineLatexView from './extensions/raw-latex/inlineLatexView';
	import { inlinePlaceholder, InlinePlaceholderView } from './extensions/raw-latex/inlinePlaceholderView';
	import { FrontmatterRawView, simpleFrontmatter, PlaceholderRawView, placeholderCommand } from './extensions/raw-latex/frontmatterView';
	import { BibliographyNodeView } from './extensions/bibliography/bibliographyNodeView.svelte';
	import environmentView from './extensions/environment/environmentView.svelte';
	import IncludeDocView from './extensions/includedoc/includeDocView.svelte';
	import { createTrailingParagraphPlugin, buildTrailingParagraphTr } from './extensions/trailing-paragraph-plugin';
	import { createBoundaryClickPlugin } from './extensions/boundary-click-plugin';
	import { createBlockHandlePlugin } from './extensions/block-handle-plugin.svelte';
	import { createNodeFlashPlugin } from './extensions/flash-plugin';
	import { createLinkPlugin } from './extensions/link';
	import type { BibLaTeXReference } from '$lib/biblatex';

	interface Props {
		// the document as a ProseMirror Node
		localValue?: PMNode | null;
		onLocalChange?: (value: PMNode) => void;
		/** any caret/selection movement (shared-session presence publishes through this). */
		onSelectionChange?: () => void;
		// references for @ citation suggestions
		localReferences?: BibLaTeXReference[];
		// where inserted images go (an images/ subfolder)
		imageDir?: string;
		placeholder?: string;
		/** called when PM undo/redo is exhausted; return true if the workspace snapshot history handled it. */
		onHistoryBoundary?: (dir: 'undo' | 'redo') => boolean;
	}

	let {
		localValue = null,
		onLocalChange,
		onSelectionChange,
		localReferences = [],
		imageDir,
		placeholder = 'Begin your journey here...',
		onHistoryBoundary
	}: Props = $props();

	$effect(() => {
		referenceStore.set(localReferences);
	});

	let editor: HTMLElement = $state(null);
	let editorView: EditorView = $state(null);
	let editorState: EditorState = $state(null);

	onMount(async () => {
		const { mathlivePlugin, mlarrowHandlers } = await import('./extensions/mathlivebridge/mlplugin');

		const plugins = [
			gapCursor(),
			// drop cursor is inline-styled (not CSS-targetable) and its default black vanishes on dark
			dropCursor({ color: 'var(--color-primary-500)', width: 2 }),
			columnResizing(),
			tableEditing(),
			...createListPlugins({ schema }),
			history(),
			...createSuggestPlugin(),
			keymap(listKeymap),
			inputRules({
				rules: [...listInputRules, ...smartQuotes, emDashRule, enDashRule, emDashUpgradeRule, ellipsis] as readonly InputRule[]
			}),
			keymap({
				// PM history first, then the workspace snapshot history (survives mode switches).
				// consume the key even at the stack edge so the browser's native undo can't fire.
				'Mod-z': (state, dispatch) => historyUndo(state, dispatch) || (onHistoryBoundary ? (onHistoryBoundary('undo'), true) : false),
				'Mod-y': (state, dispatch) => historyRedo(state, dispatch) || (onHistoryBoundary ? (onHistoryBoundary('redo'), true) : false),
				'Mod-Shift-z': (state, dispatch) => historyRedo(state, dispatch) || (onHistoryBoundary ? (onHistoryBoundary('redo'), true) : false),
				Backspace: undoInputRule,
				'Mod-b': toggleMark(schema.marks.strong),
				'Mod-i': toggleMark(schema.marks.em),
				'Mod-`': toggleMark(schema.marks.code),
				'Mod-u': toggleMark(schema.marks.u),
				'Mod-.': toggleMark(schema.marks.sup),
				'Mod-,': toggleMark(schema.marks.sub),
				'Mod-Shift-b': toggleBlockQuote(),
				'Mod-Shift-`': createCodeBlock(),
				// heading shortcuts dodge AltGr on Windows (Ctrl+Alt+N swallows the superscript digits)
				// and the mac screenshot shortcuts (Cmd+Shift+3/4/5)
				...(isMac
					? { 'Mod-Alt-1': toggleHeading(1), 'Mod-Alt-2': toggleHeading(2), 'Mod-Alt-3': toggleHeading(3) }
					: { 'Mod-Shift-1': toggleHeading(1), 'Mod-Shift-2': toggleHeading(2), 'Mod-Shift-3': toggleHeading(3) }),
				'Mod-m': createMathField(),
				'Mod-Shift-m': createMathField(true),
				Tab: (state: EditorState, dispatch: (tr: Transaction) => void) => {
					// table: next cell, otherwise cycle paragraph indent. always consume Tab so focus stays in the editor.
					if (goToNextCell(1)(state, dispatch)) return true;
					cycleParagraphIndent(1)(state, dispatch);
					return true;
				},
				'Shift-Tab': (state: EditorState, dispatch: (tr: Transaction) => void) => {
					if (goToNextCell(-1)(state, dispatch)) return true;
					cycleParagraphIndent(-1)(state, dispatch);
					return true;
				}
			}),
			cmarrowHandlers,
			mlarrowHandlers,
			mathlivePlugin,
			keymap(baseKeymap),
			imagePlugin(imageDir ? createLocalImageSettings(imageDir) : createTemplateEditorSettings()),
			menuUpdatePlugin(),
			createCursorPlugin(),
			createLinkPlugin(),
			latexClipboardPlugin,
			pasteUUIDFixPlugin,
			search(),
			tableOfContentsPlugin,
			placeholderPlugin(placeholder),
			tablePlaceholderPlugin(),
			suggestionModePlugin({ inSuggestionMode: false }),
			suggestionHoverPlugin({
				onAllResolved: () => {},
				description: 'Texpile AI'
			}),
			suggestionNodeDecoPlugin(),
			createWordCountPlugin(),
			createRefUpdatePlugin(),
			createTocPlugin(),
			createPersistentSelectionPlugin(),
			proofreadPlugin,
			createTrailingParagraphPlugin(),
			createBoundaryClickPlugin(),
			createBlockHandlePlugin(),
			createNodeFlashPlugin()
		];

		const initialDoc = localValue ?? undefined;

		editorState = EditorState.create({
			schema,
			plugins,
			doc: initialDoc
		});
		const fix = fixTables(editorState);
		if (fix) editorState = editorState.apply(fix.setMeta('addToHistory', false));
		// insert trailing paragraphs at load, not lazily on first edit, or the first keystroke grows the
		// doc and jumps the scroll. byte-neutral: empty paragraphs serialize to nothing.
		const trail = buildTrailingParagraphTr(editorState);
		if (trail) editorState = editorState.apply(trail.setMeta('addToHistory', false));

		editorView = new EditorView(editor, {
			// data-show-section-numbers drives the heading CSS counters; data-unnumbered headings are skipped
			attributes: { class: 'TexpileEditor', spellcheck: 'false', 'data-show-section-numbers': 'true' },
			state: editorState,
			// PM types getPos as possibly undefined (unmounted), but these views only call it while
			// mounted, so cast instead of threading the optionality through every constructor
			nodeViews: {
				code_block: (node, view, getPos) => new CodeBlockView(node, view, getPos as () => number),
				raw_latex: (node, view, getPos) =>
					simpleFrontmatter(node.textContent)
						? new FrontmatterRawView(node, view, getPos as () => number)
						: placeholderCommand(node.textContent)?.command === 'printbibliography'
							? new BibliographyNodeView(node, view, getPos as () => number)
							: placeholderCommand(node.textContent)
								? new PlaceholderRawView(node, view, getPos as () => number)
								: isIEEEAuthorBlock(node.textContent)
									? new IEEEAuthorView(node, view, getPos as () => number)
									: isRawFigure(node.textContent)
										? new RawFigureView(node, view, getPos as () => number, imageDir ?? '')
										: new RawLatexView(node, view, getPos as () => number),
				inline_latex: (node, view, getPos) =>
					inlinePlaceholder(node.textContent)
						? new InlinePlaceholderView(node, view, getPos as () => number)
						: new InlineLatexView(node, view, getPos as () => number),
				includedoc: (node, view, getPos) => new IncludeDocView(node, view, getPos as () => number, imageDir ?? ''),
				environment: environmentView,
				table_wrapper: tableWrapperView,
				citation: (node, view, getPos) => new CitationView(node, view, getPos),
				ref: (node, view) => new RefView(node, view)
			},
			editable: () => true,
			dispatchTransaction(transaction) {
				const newState = this.state.apply(transaction);
				this.updateState(newState);

				// collabRemotePatch: a collaborator's edit patched in from the shared doc; it's already
				// the serialized truth, so it must not re-enter the save pipeline as a local change
				if (onLocalChange && transaction.docChanged && !transaction.getMeta('collabRemotePatch')) {
					onLocalChange(newState.doc);
				}
				if (onSelectionChange && (transaction.selectionSet || transaction.docChanged)) onSelectionChange();
			}
		});

		$editorViewStore = editorView;

		editor?.classList?.remove('hidden');
		editorView.focus();
	});

	function scrollParent(el: HTMLElement | null): HTMLElement | null {
		let cur = el?.parentElement ?? null;
		while (cur) {
			const oy = getComputedStyle(cur).overflowY;
			if ((oy === 'auto' || oy === 'scroll') && cur.scrollHeight > cur.clientHeight) return cur;
			cur = cur.parentElement;
		}
		return null;
	}

	// swap in a re-parsed doc without remounting: a fresh EditorState on the same view keeps the DOM
	// and scroll. fires only when localValue changes (async re-parse landing), never on typing.
	let mountedDoc: PMNode | null = null;
	$effect(() => {
		const next = localValue;
		if (!editorView || !next) return;
		if (mountedDoc === null) {
			// initial doc was installed at construction, just remember it
			mountedDoc = next;
			return;
		}
		if (next === mountedDoc) return;
		if (next === editorView.state.doc) {
			// a collab patch installed this exact doc on the view already; just adopt it
			mountedDoc = next;
			return;
		}

		// a bare updateState resets the selection to doc start and the focused editor scrolls to it,
		// so carry the caret offset (clamped) and scroll position across the swap
		const scroller = scrollParent(editorView.dom);
		const savedTop = scroller?.scrollTop ?? 0;
		const prevAnchor = editorView.state.selection.anchor;

		let base = EditorState.create({ schema, plugins: editorView.state.plugins, doc: next });
		// same trailing-paragraph normalization as at mount
		const trail = buildTrailingParagraphTr(base);
		if (trail) base = base.apply(trail.setMeta('addToHistory', false));
		let restored = base;
		try {
			const pos = Math.min(Math.max(1, prevAnchor), base.doc.content.size);
			restored = base.apply(base.tr.setSelection(TextSelection.near(base.doc.resolve(pos))).setMeta('addToHistory', false));
		} catch {
			restored = base; // structural change, position didn't map, fall back to default selection
		}
		editorView.updateState(restored);
		mountedDoc = next;

		if (scroller) {
			scroller.scrollTop = savedTop; // undo any synchronous caret-scroll from the state swap
			// single rAF by contract: WorkspaceView's mode-switch scroll anchor uses a double rAF to
			// land after this restore, so bumping this to a double rAF would stomp the anchor
			requestAnimationFrame(() => (scroller.scrollTop = savedTop)); // and any post-layout scrollIntoView
		}
	});

	$effect(() => {
		if (editorView?.dom) {
			(editorView.dom as HTMLElement).style.setProperty('zoom', `${preferences.zoom}`, 'important');
		}
	});

	$effect(() => {
		if (editorView?.dom) {
			if (preferences.pageView) {
				editorView.dom.classList.add('page-view');
			} else {
				editorView.dom.classList.remove('page-view');
			}
		}
	});

	onDestroy(() => {
		editorView?.destroy();
		editorViewStore.set(null);
		// don't clear referenceStore here, the workspace owns it; clearing blanked citations
		// in source mode and across editor remounts
	});
</script>

<main bind:this={editor} class="hidden"></main>

<ContextMenu />

<style lang="postcss">
	@reference "../../app.css";

	:global(.suggestion-add) {
		background-color: rgba(74, 222, 128, 0.2);
		border-bottom: 2px solid rgba(74, 222, 128, 0.5);
	}
	:global(.suggestion-delete) {
		background-color: rgba(239, 68, 68, 0.15);
		text-decoration: line-through;
		text-decoration-color: rgba(239, 68, 68, 0.6);
		opacity: 0.7;
	}
	:global(.suggestion-node-insert) {
		outline: 2px solid rgba(74, 222, 128, 0.5);
		background-color: rgba(74, 222, 128, 0.08);
	}
	:global(.suggestion-node-delete) {
		outline: 2px solid rgba(239, 68, 68, 0.4);
		background-color: rgba(239, 68, 68, 0.08);
		opacity: 0.6;
	}

	:global(.agent-diff-insert) {
		background-color: rgba(74, 222, 128, 0.2);
		outline: 2px solid rgba(74, 222, 128, 0.4);
		outline-offset: -1px;
	}
	:global(.agent-diff-delete) {
		background-color: rgba(239, 68, 68, 0.15);
		text-decoration: line-through;
		color: rgba(239, 68, 68, 0.8);
		opacity: 0.7;
	}

	:global(.agent-highlight) {
		background-color: rgba(250, 204, 21, 0.35);
		outline: 1px solid rgba(250, 204, 21, 0.6);
		outline-offset: -1px;
		border-radius: 2px;
	}
	:global(.dark .agent-highlight) {
		background-color: rgba(250, 204, 21, 0.25);
		outline: 1px solid rgba(250, 204, 21, 0.4);
	}

	:global(.TexpileEditor) {
		@apply m-1 max-w-full leading-relaxed outline-none;
	}

	:global(.TexpileEditor.page-view) {
		@apply mx-auto my-8 w-[85%] max-w-[1400px] rounded-sm bg-white px-[8%] py-12 shadow-lg dark:bg-gray-50;
		min-height: 70vh;
	}

	:global(.TexpileEditor[data-readonly='true']) {
		cursor: default;
	}

	:global(.TexpileEditor[data-readonly='true'] .ProseMirror-selectednode) {
		outline: none;
	}

	:global(.TexpileEditor[data-readonly='true'] .column-resize-handle) {
		display: none !important;
	}

	/* first-child div is the image alignment buttons */
	:global(.TexpileEditor[data-readonly='true'] .image-overlay-wrapper > div:first-child) {
		display: none !important;
	}

	:global(.TexpileEditor[data-readonly='true'] .imageResizeBoxWrapper) {
		display: none !important;
	}

	:global(math-field::part(virtual-keyboard-toggle)) {
		display: none;
	}

	:global(math-field::part(menu-toggle)) {
		display: none;
	}

	:global(.TexpileEditor h1) {
		@apply text-3xl font-semibold md:text-4xl;
	}
	:global(.TexpileEditor h2) {
		@apply text-2xl font-semibold md:text-3xl;
	}
	:global(.TexpileEditor h3) {
		@apply text-xl font-semibold md:text-2xl;
	}
	:global(.TexpileEditor h4) {
		@apply text-lg font-semibold md:text-xl;
	}
	:global(.TexpileEditor h5) {
		@apply text-base font-medium md:text-lg;
	}
	:global(.TexpileEditor h6) {
		@apply text-sm font-medium md:text-base;
	}

	:global(.TexpileEditor h1, .TexpileEditor h2, .TexpileEditor h3, .TexpileEditor h4, .TexpileEditor h5, .TexpileEditor h6) {
		@apply mb-2 leading-snug;
	}

	:global(.TexpileEditor p) {
		@apply mb-3 text-base;
	}

	:global(.TexpileEditor li p) {
		@apply m-0;
	}

	:global(.TexpileEditor ul),
	:global(.TexpileEditor ol) {
		@apply my-3 pl-6;
	}
	:global(.TexpileEditor li) {
		@apply leading-relaxed;
	}
	:global(.TexpileEditor li + li) {
		@apply mt-1;
	}

	:global(.TexpileEditor blockquote) {
		@apply border-primary-300-700 text-surface-700-300 my-4 border-l-4 pl-4 italic;
	}

	:global(.TexpileEditor div.abstract) {
		@apply border-surface-300-700 bg-surface-100-900 relative mx-4 my-6 rounded border p-4 pt-8;
	}
	:global(.TexpileEditor div.abstract::before) {
		content: 'Abstract';
		@apply text-surface-600-400 absolute top-2 left-4 text-[10px] font-semibold tracking-wider uppercase;
	}
	:global(.TexpileEditor div.abstract p) {
		@apply my-2 leading-relaxed;
	}

	:global(.TexpileEditor code) {
		@apply bg-surface-200-800 rounded px-1 py-0.5 text-[0.95em];
	}
	:global(.TexpileEditor pre) {
		@apply bg-surface-200-800 my-3 overflow-x-auto rounded p-3 text-[0.95em];
	}
	:global(.TexpileEditor table) {
		@apply my-4 w-full border-collapse;
	}
	:global(.TexpileEditor th),
	:global(.TexpileEditor td) {
		@apply border-surface-300-700 border px-3 py-2 align-top;
	}
	:global(.TexpileEditor th) {
		@apply bg-surface-100-900 text-surface-800-200 font-semibold;
	}
</style>
