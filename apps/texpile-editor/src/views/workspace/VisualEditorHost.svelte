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
	import type { CommentRange } from '$lib/editor/visual/extensions/comments';
	import type { RegionParser, SourceMap } from '$lib/editor/visual/sourceSpans';
	import { sourceAnchorFor } from '$lib/editor/visual/extensions/pmComments';
	import { dirname } from '$lib/workspace/fileSystem';
	import { caretFromMargin } from '$lib/editor/visual/marginClick';
	import { showInOutputAt } from '$lib/editor/visual/contextMenu/showInOutput';
	import { editorViewStore } from '$lib/stores/editorStore';
	import { m } from '$lib/paraglide/messages';
	import { spellingFor } from '$lib/editor/spellcheck/languages/spellingLanguage.svelte';

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
		onVisualReady,
		onMdLink,
		onEditFrontmatter,
		commentRanges,
		sourceMap,
		regionParser,
		selectedComment,
		onSelectComment,
		onAddCommentAnchored,
		onInsertCitation,
		onCiteByDoi,
		onSyncToPdf,
		onJumpToLabel,
		onJumpToDefinition,
		onCommentsPlaced,
		commentPendingActive,
		live = true
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
		onVisualReady: () => void;
		onMdLink: (href: string) => boolean;
		onEditFrontmatter: (kind: string, inner: string) => void;
		/** the open file's threads as ranges of texSource, placed here through the map */
		commentRanges: CommentRange[];
		sourceMap: SourceMap;
		/** parses a stretch of texSource as the file was parsed, for drawing suggestions */
		regionParser: RegionParser | null;
		selectedComment: string | null;
		onSelectComment?: (id: string) => void;
		onAddCommentAnchored?: (anchor: CommentAnchor | null) => void;
		onInsertCitation?: () => void;
		onCiteByDoi?: () => void;
		/** a 1-based line of texSource shown in the PDF, or in the Typst preview */
		onSyncToPdf?: (line: number) => void;
		onJumpToLabel?: (name: string) => boolean;
		onJumpToDefinition?: (name: string) => boolean;
		onCommentsPlaced?: (lost: string[]) => void;
		commentPendingActive: boolean;
		/** false in a parked editor group */
		live?: boolean;
	} = $props();

	// the stretch of texSource the document is
	const bodyRange = $derived(
		docMeta?.hadDocumentEnv
			? { from: docMeta.preamble.length, to: texSource.length - docMeta.postamble.length }
			: { from: 0, to: texSource.length }
	);
	const showInOutput = $derived(
		onSyncToPdf && kind !== 'md'
			? showInOutputAt(kind === 'typ' ? m.tbar_ctx_show_in_preview() : m.tbar_ctx_show_in_pdf(), sourceMap, texSource, onSyncToPdf)
			: undefined
	);
	const spelling = $derived(spellingFor(loadedPath, texSource));
	// a selection in any of the editors, as the range of texSource its characters are
	function sourceAnchor(doc: PMNode, from: number, to: number): CommentAnchor | null {
		return sourceAnchorFor(doc, sourceMap, texSource, from, to);
	}
</script>

<!-- texpile-main-editor scopes the editor's right-click context menu (ContextMenu.svelte) -->
<!-- pl-12 and pr-7.5 reserve room for the block-handle gutters (48px left; 30px right, exactly the delete button's,
     so comment cards start just past it); on narrow windows the mx-auto centering margin collapses and this padding
     keeps them from clipping.
     The \noindent marker has to fit this 48px too, which is why it is abbreviated (app.css).
     No bottom padding: the editor itself runs to the foot of the pane (app.css), so a drop or a
     click below the last block lands in it -->
<div
	class="flex min-h-full flex-col pt-8 pr-7.5 pl-12 group-data-[gutter-stacked]/pane:pr-1 group-data-[gutter-stacked]/pane:pl-7.5"
	onmousedown={(event) => live && caretFromMargin(event, editorViewStore.current)}
	role="presentation"
>
	<!-- the measure: past it a wide window pads with empty space rather than stretching the line length -->
	<div class="texpile-main-editor mx-auto w-full max-w-3xl min-w-0">
		{#if docMeta?.hadDocumentEnv && kind === 'tex'}
			<!-- \title/\author fields are LaTeX; md frontmatter is YAML, edited in source mode -->
			<PreambleFrontmatter preamble={docMeta.preamble} onEdit={onEditFrontmatter} />
		{/if}
		{#if showRenderBar}
			<!-- no height of its own, so it hangs over the top of the editor root rather than moving it: that
			     root grows to the foot of the pane (app.css), which had been pushing the bar off the bottom of
			     the screen, and shifting it would throw off the screenful revealBuiltEditor measures.
			     Nothing is covered, since the root holds nothing painted until it is revealed. -->
			<div class="h-0 min-h-0">
				<VisualLoading mounting format={kind} sizeBytes={texSource.length} />
			</div>
		{/if}
		{#if kind === 'md'}
			<MarkdownEditorView
				{live}
				spellLanguage={spelling.language}
				localValue={visualDoc}
				docPath={loadedPath}
				localReferences={allReferences}
				imageDir={dirname(loadedPath)}
				onLocalChange={onVisualChange}
				onSelectionChange={onVisualSelection}
				placeholder={m.wsview_editor_placeholder()}
				onReady={onVisualReady}
				onOpenLink={onMdLink}
				{commentRanges}
				{sourceMap}
				{texSource}
				{bodyRange}
				{regionParser}
				{sourceAnchor}
				{selectedComment}
				{onSelectComment}
				onAddComment={onAddCommentAnchored}
				{onCommentsPlaced}
				{commentPendingActive}
				addCommentLabel={m.comments_add()}
			/>
		{:else if kind === 'typ'}
			<TypstEditorView
				{live}
				spellLanguage={spelling.language}
				localValue={visualDoc}
				docPath={loadedPath}
				localReferences={allReferences}
				docDir={dirname(loadedPath)}
				onLocalChange={onVisualChange}
				onSelectionChange={onVisualSelection}
				placeholder={m.wsview_editor_placeholder()}
				onReady={onVisualReady}
				onOpenLink={onMdLink}
				{commentRanges}
				{sourceMap}
				{texSource}
				{bodyRange}
				{regionParser}
				{sourceAnchor}
				{selectedComment}
				{onSelectComment}
				onAddComment={onAddCommentAnchored}
				{onInsertCitation}
				{onCiteByDoi}
				{showInOutput}
				{onCommentsPlaced}
				{commentPendingActive}
				addCommentLabel={m.comments_add()}
			/>
		{:else}
			<LatexEditorView
				{live}
				spellLanguage={spelling.language}
				localValue={visualDoc}
				docPath={loadedPath}
				localReferences={allReferences}
				imageDir={dirname(loadedPath)}
				onLocalChange={onVisualChange}
				onSelectionChange={onVisualSelection}
				placeholder={m.wsview_editor_placeholder()}
				onReady={onVisualReady}
				{commentRanges}
				{sourceMap}
				{texSource}
				{bodyRange}
				{regionParser}
				{sourceAnchor}
				{selectedComment}
				{onSelectComment}
				onAddComment={onAddCommentAnchored}
				{onInsertCitation}
				{onCiteByDoi}
				{showInOutput}
				{onJumpToLabel}
				{onJumpToDefinition}
				{onCommentsPlaced}
				{commentPendingActive}
				addCommentLabel={m.comments_add()}
			/>
		{/if}
	</div>
</div>
