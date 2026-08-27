<script lang="ts">
	// The Typst visual editor: its OWN ProseMirror over typSchema, third sibling of EditorView and
	// MarkdownEditorView. Extensions are shared only where they are schema-agnostic (they read
	// state.schema); everything whose editing model is LaTeX-shaped (tables, MathLive, images,
	// intellisense, citations, the latex clipboard) is deliberately absent — those constructs
	// live in raw islands until they get typst-aware machinery (see typSchema's comment).
	import { onDestroy, onMount } from 'svelte';
	import { EditorState, type Transaction } from 'prosemirror-state';
	import { EditorView } from 'prosemirror-view';
	import type { Node as PMNode } from 'prosemirror-model';
	import { fixTables } from 'prosemirror-tables';
	import { typSchema } from './schema';
	import { typstEditorPlugins, typstNodeViews } from './typstEditorSetup';
	import { swapParsedDoc } from '$lib/editor/visual/docSwap';
	import { editorViewStore, referenceStore } from '$lib/stores/editorStore';
	import type { BiblatexReference } from '$lib/languages/bib/biblatex';
	import { preferences } from '$lib/stores/preferencesStore.svelte';
	import ContextMenu from '$lib/editor/visual/toolbar/ContextMenu.svelte';
	import { syncPmComments } from '$lib/editor/visual/extensions/pmCommentsSync.svelte';
	import type { CommentAnchor } from '$lib/comments/anchor';
	import type { CommentThread } from '$lib/comments/log';
	import 'prosemirror-view/style/prosemirror.css';
	import 'prosemirror-tables/style/tables.css';
	import 'prosemirror-gapcursor/style/gapcursor.css';
	import 'prosemirror-flat-list/dist/style.css';
	import 'prosemirror-search/style/search.css';
	import '$lib/editor/visual/extensions/image/styles/common.css';
	import '$lib/editor/visual/styles/cursor.css';

	type Props = {
		localValue?: PMNode | null;
		onLocalChange?: (value: PMNode) => void;
		onSelectionChange?: () => void;
		placeholder?: string;
		onHistoryBoundary?: (dir: 'undo' | 'redo') => boolean;
		onReady?: () => void;
		/** the link tooltip's Open action: return true when handled in-app, false for the browser. */
		onOpenLink?: (href: string) => boolean;
		/** the open file's directory; #include chips resolve their paths against it */
		docDir?: string;
		/** the project's bibliography; @target chips resolve against it for display */
		localReferences?: BiblatexReference[];
		/** review comments, same contract as the latex EditorView; see extensions/pmComments */
		commentThreads?: CommentThread[];
		selectedComment?: string | null;
		onSelectComment?: (id: string, from: 'visual') => void;
		onAddComment?: (anchor: CommentAnchor | null) => void;
		/** pick citations from Zotero, offered in the context menu when present */
		onInsertCitation?: () => void;
		/** pick citations from the personal library, offered in the context menu when present */
		onInsertLibraryCitation?: () => void;
		onCommentsPlaced?: (lost: string[]) => void;
		addCommentLabel?: string;
		/** a composer is open for a selection here; false clears the pending selection tint */
		commentPendingActive?: boolean;
	};

	let {
		localValue = null,
		onLocalChange,
		onSelectionChange,
		placeholder = '',
		onHistoryBoundary,
		onReady,
		onOpenLink,
		docDir = '',
		localReferences = [],
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

	let editor: HTMLElement = $state(null!);
	let editorView: EditorView | null = $state(null);

	onMount(async () => {
		// MathLive edits the math nodes' LaTeX content; the serializer's mathTypstOf round-trips
		// it back to typst through MathLive's own typst serializer (see latexToTypst.ts)
		const { mathlivePlugin, mlarrowHandlers } = await import('$lib/editor/visual/extensions/mathlivebridge/mlplugin');

		const plugins = typstEditorPlugins({
			mathlivePlugin,
			mlarrowHandlers,
			docDir,
			placeholder,
			onHistoryBoundary,
			onOpenLink,
			onSelectComment,
			onAddComment,
			addCommentLabel
		});

		let editorState = EditorState.create({ schema: typSchema, plugins, doc: localValue ?? undefined });
		const fix = fixTables(editorState);
		if (fix) editorState = editorState.apply(fix.setMeta('addToHistory', false));

		editorView = new EditorView(editor, {
			attributes: { class: 'TexpileEditor TypstEditor', spellcheck: 'false' },
			state: editorState,
			nodeViews: typstNodeViews(docDir),
			editable: () => true,
			dispatchTransaction(this: EditorView, transaction: Transaction) {
				// async plugins (spellcheck) can dispatch into a destroyed view on tab switches
				if (this.isDestroyed) return;
				const newState = this.state.apply(transaction);
				this.updateState(newState);
				// collabRemotePatch: a collaborator's edit patched in from the shared doc. It is
				// already IN the shared doc, so reporting it as a local change would echo it back
				if (onLocalChange && transaction.docChanged && !transaction.getMeta('collabRemotePatch')) onLocalChange(newState.doc);
				if (onSelectionChange && (transaction.selectionSet || transaction.docChanged)) onSelectionChange();
			}
		});

		editorViewStore.current = editorView;
		editor?.classList?.remove('hidden');
		editorView.focus();
		onReady?.();
	});

	// swap in a re-parsed doc without remounting (same contract as the other editor views): a
	// fresh EditorState on the same view keeps the DOM and scroll; fires only when localValue changes
	let mountedDoc: PMNode | null = null;
	/** bumped only on doc SWAPS (see pmCommentsSync); typing maps ranges instead */
	let docEpoch = $state(0);
	$effect(() => {
		const next = localValue;
		if (!editorView || !next) return;
		if (mountedDoc === null) {
			mountedDoc = next;
			return;
		}
		if (next === mountedDoc || next === editorView.state.doc) {
			mountedDoc = next;
			return;
		}

		swapParsedDoc(editorView, typSchema, next);
		mountedDoc = next;
		docEpoch++;
	});

	// after the swap effect, so the sync reads the newly-installed document
	syncPmComments({
		view: () => editorView,
		threads: () => commentThreads,
		dialect: 'typ',
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

	onDestroy(() => {
		editorView?.destroy();
		editorViewStore.current = null;
	});
</script>

<main bind:this={editor} class="hidden"></main>

<ContextMenu dialect="typst" {onAddComment} {onInsertCitation} {onInsertLibraryCitation} />

<style lang="postcss">
	@reference "../../../../app.css";

	/* (the code-block card's quiet inset is now the shared default in cmview.ts, so the override
	   that used to live here is gone) */

	/* raw-island insets are tightened in RawLatexView itself (all dialects), nothing typst-specific */

	/* A labeled equation shows its <label> where LaTeX shows "(1)": the editor cannot know the
	   real number (numbering is the template's #set math.equation rule), but the label proves the
	   equation is referenceable and is exactly what the @ picker offers. mlview sets the attr. */
	:global(.TypstEditor .block-math-container[data-typst-label]:not([data-typst-label=''])::after) {
		content: '<' attr(data-typst-label) '>';
		position: absolute;
		right: 1rem;
		top: 50%;
		transform: translateY(-50%);
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 0.8em;
		color: var(--color-surface-500);
		user-select: none;
		pointer-events: none;
	}
	/* keep the hover gear clear of the chip, the way the LaTeX number pushes it left */
	:global(.TypstEditor .block-math-container[data-typst-label]:not([data-typst-label='']) .math-settings-container) {
		right: 5rem;
	}

	/* @target chips: citation tint when the key resolves in the bibliography, neutral otherwise */
	:global(.TypstEditor .typ-ref) {
		border-radius: var(--radius-base, 4px);
		padding: 0 0.2em;
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 0.85em;
		background: color-mix(in srgb, var(--color-surface-500) 14%, transparent);
		cursor: default;
	}
	:global(.TypstEditor .typ-ref-known) {
		background: color-mix(in srgb, var(--color-primary-500) 16%, transparent);
		color: var(--color-primary-700);
	}
	:global(.dark .TypstEditor .typ-ref-known) {
		color: var(--color-primary-300);
	}

	/* figure-wrapped tables render through the shared tableWrapperView (typst mode), which owns
	   the "Table N" header and caption layout; numbering stays approximate (raw-island tables
	   aren't counted, the preview is the authority) */

	/* term lists: bold term line, hanging description */
	:global(.TypstEditor .term-item) {
		margin: 0.25rem 0;
	}
	:global(.TypstEditor .term-title) {
		font-weight: 600;
	}
	:global(.TypstEditor .term-item > :not(.term-title)) {
		margin-left: 1.25rem;
	}
</style>
