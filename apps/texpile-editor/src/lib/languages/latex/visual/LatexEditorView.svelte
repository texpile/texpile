<script lang="ts">
	import ContextMenu from '$lib/editor/visual/toolbar/ContextMenu.svelte';
	import { onDestroy, onMount } from 'svelte';
	import { EditorState, Transaction } from 'prosemirror-state';
	import { EditorView } from 'prosemirror-view';
	import type { Node as PMNode } from 'prosemirror-model';
	import { schema } from '$lib/languages/latex/schema/latexPMSchema';
	import { latexEditorPlugins, latexNodeViews } from './latexEditorSetup';
	import { swapParsedDoc } from '$lib/editor/visual/docSwap';
	import { editorViewStore, referenceStore } from '$lib/stores/editorStore';
	import { preferences } from '$lib/stores/preferencesStore.svelte';
	import { fixTables } from 'prosemirror-tables';
	import 'prosemirror-view/style/prosemirror.css';
	import 'prosemirror-tables/style/tables.css';
	import 'prosemirror-gapcursor/style/gapcursor.css';
	import '$lib/editor/visual/extensions/image/styles/common.css';
	import '$lib/editor/visual/extensions/image/styles/withResize.css';
	import '$lib/editor/visual/extensions/image/styles/sideResize.css';
	import '$lib/editor/visual/styles/cursor.css';
	import 'prosemirror-flat-list/dist/style.css';
	import 'prosemirror-search/style/search.css';
	import { syncPmComments } from '$lib/editor/visual/extensions/pmCommentsSync.svelte';
	import type { CommentAnchor } from '$lib/comments/anchor';
	import type { CommentThread } from '$lib/comments/log';
	import type { BiblatexReference } from '$lib/languages/bib/biblatex';

	type Props = {
		// the document as a ProseMirror Node
		localValue?: PMNode | null;
		onLocalChange?: (value: PMNode) => void;
		/** any caret/selection movement (shared-session presence publishes through this). */
		onSelectionChange?: () => void;
		// references for @ citation suggestions
		localReferences?: BiblatexReference[];
		// where inserted images go (an images/ subfolder)
		imageDir?: string;
		placeholder?: string;
		/** called when PM undo/redo is exhausted; return true if the workspace snapshot history handled it. */
		onHistoryBoundary?: (dir: 'undo' | 'redo') => boolean;
		/** Fired once the ProseMirror view exists and is on screen. Building it is a long synchronous
		 * block on a large document, and it starts only after the dynamic import below resolves - well
		 * after this component's own mount - so callers cannot infer it from mounting. */
		onReady?: () => void;
		/** review threads on this file; resolved here against the rendered text (see pmComments) */
		commentThreads?: CommentThread[];
		/** the thread the reader is looking at, highlighted stronger than the rest */
		selectedComment?: string | null;
		/** commented text was clicked. Origin 'visual': unlike source mode's prose clicks, this one
		 * OPENS the panel - the visual editor has no gutter rail, so the highlight is the only
		 * affordance pointing at the thread, and select-only left no way in at all. */
		onSelectComment?: (id: string, from: 'visual') => void;
		/** the reader asked to comment on a selection; the anchor is rendered-dialect (buildPmAnchor) */
		onAddComment?: (anchor: CommentAnchor | null) => void;
		/** pick citations from Zotero, offered in the context menu when present */
		onInsertCitation?: () => void;
		/** pick citations from the personal library, offered in the context menu when present */
		onInsertLibraryCitation?: () => void;
		/** after each placement pass: the threads that could not be drawn in this view (every tier
		 * failed), so the panel can say "not in this view" instead of implying they are gone */
		onCommentsPlaced?: (lost: string[]) => void;
		/** a composer is open for a selection here; false clears the pending selection tint */
		commentPendingActive?: boolean;
		/** pill label, translated by the caller */
		addCommentLabel?: string;
	};

	let {
		localValue = null,
		onLocalChange,
		onSelectionChange,
		localReferences = [],
		imageDir,
		placeholder = 'Begin your journey here...',
		onHistoryBoundary,
		onReady,
		commentThreads = [],
		selectedComment = null,
		onSelectComment,
		onAddComment,
		onInsertCitation,
		onInsertLibraryCitation,
		onCommentsPlaced,
		addCommentLabel = 'Comment',
		commentPendingActive = false
	}: Props = $props();

	$effect(() => {
		referenceStore.current = localReferences;
	});

	let editor: HTMLElement | null = $state(null);
	let editorView: EditorView | null = $state(null);
	let editorState: EditorState | null = $state(null);

	onMount(async () => {
		const { mathlivePlugin, mlarrowHandlers } = await import('$lib/editor/visual/extensions/mathlivebridge/mlplugin');

		const plugins = latexEditorPlugins({
			mathlivePlugin,
			mlarrowHandlers,
			imageDir,
			placeholder,
			onHistoryBoundary,
			onSelectComment,
			onAddComment,
			addCommentLabel
		});

		const initialDoc = localValue ?? undefined;

		editorState = EditorState.create({
			schema,
			plugins,
			doc: initialDoc
		});
		const fix = fixTables(editorState);
		if (fix) editorState = editorState.apply(fix.setMeta('addToHistory', false));

		editorView = new EditorView(editor, {
			// data-show-section-numbers drives the heading CSS counters; data-unnumbered headings are skipped
			attributes: { class: 'TexpileEditor', spellcheck: 'false', 'data-show-section-numbers': 'true' },
			state: editorState,
			nodeViews: latexNodeViews(imageDir ?? ''),
			editable: () => true,
			dispatchTransaction(this: EditorView, transaction: Transaction) {
				// A plugin that finishes asynchronously can dispatch into a view that was destroyed while
				// it was working - the spellchecker does exactly this when a tab switch tears the editor
				// down mid-check. destroy() nulls docView, and updateState then throws reading
				// docView.matchesNode, which surfaces as an unhandled rejection on every switch.
				// Dropping is right: only async plugins can reach here after destroy (user input needs a
				// live view), and what they carry is decorations for a document nobody is looking at.
				if (this.isDestroyed) return;
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

		editorViewStore.current = editorView;

		editor?.classList?.remove('hidden');
		editorView.focus();
		onReady?.();
	});

	// swap in a re-parsed doc without remounting: a fresh EditorState on the same view keeps the DOM
	// and scroll. fires only when localValue changes (async re-parse landing), never on typing.
	let mountedDoc: PMNode | null = null;
	/** bumped when a doc SWAP lands - the one moment plugin state was rebuilt and comment ranges
	 * with it. Typing never bumps it: ranges map through transactions and re-searching mid-edit
	 * could snap a range onto another copy of its text. */
	let docEpoch = $state(0);
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

		swapParsedDoc(editorView, schema, next);
		mountedDoc = next;
		docEpoch++;
	});

	// Declared AFTER the swap effect on purpose: effects run in declaration order, so by the time
	// the sync reads editorView.state.doc the swap has already installed the new document.
	syncPmComments({
		view: () => editorView,
		threads: () => commentThreads,
		dialect: 'tex',
		epoch: () => docEpoch,
		selected: () => selectedComment,
		onPlaced: (lost) => onCommentsPlaced?.(lost),
		pendingActive: () => commentPendingActive
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
		editorViewStore.current = null;
		// don't clear referenceStore here, the workspace owns it; clearing blanked citations
		// in source mode and across editor remounts
	});
</script>

<main bind:this={editor} class="hidden"></main>

<ContextMenu {onAddComment} {onInsertCitation} {onInsertLibraryCitation} />

<style lang="postcss">
	@reference "../../../../app.css";

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
