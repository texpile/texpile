<script lang="ts">
	// One of three ProseMirrors, by dialect - each an entirely separate editor over its own
	// schema (see lib/languages/*) - plus the preamble frontmatter and the mounting shimmer.
	import type { Node as PMNode } from 'prosemirror-model';
	import PreambleFrontmatter from '$lib/editor/visual/PreambleFrontmatter.svelte';
	import VisualLoading from '$lib/editor/visual/VisualLoading.svelte';
	import LatexEditorView from '$lib/languages/latex/visual/LatexEditorView.svelte';
	import MarkdownEditorView from '$lib/languages/markdown/visual/MarkdownEditorView.svelte';
	import TypstEditorView from '$lib/languages/typst/visual/TypstEditorView.svelte';
	import type { ParsedLatexFile } from '$lib/workspace/latexRoundtrip';
	import type { FileKind } from '$lib/workspace/documentBuffer.svelte';
	import type { BiblatexReference } from '$lib/workspace/citations';
	import type { CommentAnchor } from '$lib/comments/anchor';
	import type { CommentThread } from '$lib/comments/log';
	import { dirname } from '$lib/workspace/fileSystem';
	import { settings } from '$lib/settings';
	import { m } from '$lib/paraglide/messages';

	let {
		kind,
		loadedPath,
		visualDoc,
		docMeta,
		texSource,
		allReferences,
		showRenderBar,
		onVisualChange,
		onVisualSelection,
		onHistoryBoundary,
		onVisualReady,
		onMdLink,
		onEditFrontmatter,
		commentThreads,
		selectedComment,
		onSelectComment,
		onAddCommentAnchored,
		onInsertCitation,
		onInsertLibraryCitation,
		onCommentsPlaced,
		commentPendingActive
	}: {
		kind: FileKind;
		loadedPath: string;
		visualDoc: PMNode;
		docMeta: Pick<ParsedLatexFile, 'preamble' | 'postamble' | 'hadDocumentEnv'> | null;
		texSource: string;
		allReferences: BiblatexReference[];
		showRenderBar: boolean;
		onVisualChange: (doc: PMNode) => void;
		onVisualSelection?: () => void;
		onHistoryBoundary?: (dir: 'undo' | 'redo') => boolean;
		onVisualReady: () => void;
		onMdLink: (href: string) => boolean;
		onEditFrontmatter: (kind: string, inner: string) => void;
		commentThreads: CommentThread[];
		selectedComment: string | null;
		onSelectComment?: (id: string, from: 'visual') => void;
		onAddCommentAnchored?: (anchor: CommentAnchor | null) => void;
		onInsertCitation?: () => void;
		onInsertLibraryCitation?: () => void;
		onCommentsPlaced?: (lost: string[]) => void;
		commentPendingActive: boolean;
	} = $props();
</script>

<!-- texpile-main-editor scopes the editor's right-click context menu (ContextMenu.svelte) -->
<!-- px-12 reserves room for the block-handle gutters (~48px left / ~30px right); on narrow
     windows the mx-auto centering margin collapses and this padding keeps them from clipping.
     The \noindent marker has to fit this 48px too, which is why it is abbreviated (app.css) -->
<div class="px-12 py-8">
	<!-- the measure, from Preferences. Was a fixed max-w-3xl (768px), which is still the
	     default; past it a wide window pads with empty space rather than stretching the
	     line length, and how much of that is comfortable is a matter of taste -->
	<div class="texpile-main-editor mx-auto w-full min-w-0" style="max-width: {settings.current.visualMaxWidth ?? 768}px">
		{#if docMeta?.hadDocumentEnv && kind === 'tex'}
			<!-- \title/\author fields are LaTeX; md frontmatter is YAML, edited in source mode -->
			<PreambleFrontmatter preamble={docMeta.preamble} onEdit={onEditFrontmatter} />
		{/if}
		{#if kind === 'md'}
			<MarkdownEditorView
				localValue={visualDoc}
				localReferences={allReferences}
				imageDir={dirname(loadedPath)}
				onLocalChange={onVisualChange}
				onSelectionChange={onVisualSelection}
				placeholder={m.wsview_editor_placeholder()}
				{onHistoryBoundary}
				onReady={onVisualReady}
				onOpenLink={onMdLink}
				{commentThreads}
				{selectedComment}
				{onSelectComment}
				onAddComment={onAddCommentAnchored}
				{onCommentsPlaced}
				{commentPendingActive}
				addCommentLabel={m.comments_add()}
			/>
		{:else if kind === 'typ'}
			<TypstEditorView
				localValue={visualDoc}
				localReferences={allReferences}
				docDir={dirname(loadedPath)}
				onLocalChange={onVisualChange}
				onSelectionChange={onVisualSelection}
				placeholder={m.wsview_editor_placeholder()}
				{onHistoryBoundary}
				onReady={onVisualReady}
				onOpenLink={onMdLink}
				{commentThreads}
				{selectedComment}
				{onSelectComment}
				onAddComment={onAddCommentAnchored}
				{onInsertCitation}
				{onInsertLibraryCitation}
				{onCommentsPlaced}
				{commentPendingActive}
				addCommentLabel={m.comments_add()}
			/>
		{:else}
			<LatexEditorView
				localValue={visualDoc}
				localReferences={allReferences}
				imageDir={dirname(loadedPath)}
				onLocalChange={onVisualChange}
				onSelectionChange={onVisualSelection}
				placeholder={m.wsview_editor_placeholder()}
				{onHistoryBoundary}
				onReady={onVisualReady}
				{commentThreads}
				{selectedComment}
				{onSelectComment}
				onAddComment={onAddCommentAnchored}
				{onInsertCitation}
				{onInsertLibraryCitation}
				{onCommentsPlaced}
				{commentPendingActive}
				addCommentLabel={m.comments_add()}
			/>
		{/if}
		{#if showRenderBar}
			<!-- EditorView keeps its own root hidden until ProseMirror exists, so this sits in the
			     space the editor will occupy rather than over it. It is on screen for the paint
			     that happens while EditorView awaits its dynamic import, and stays there through
			     the synchronous build that follows. -->
			<VisualLoading mounting sizeBytes={texSource.length} />
		{/if}
	</div>
</div>
