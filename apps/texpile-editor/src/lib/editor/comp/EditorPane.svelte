<script lang="ts">
	// The editor column: the mode toolbar on top and, under it, whichever surface the open file
	// needs (starter picker, diff, source, visual, bib, pdf, image). Chooses the surface; the
	// state behind it all lives in WorkspaceView.
	import type { Node as PMNode } from 'prosemirror-model';
	import type { ComponentProps } from 'svelte';
	import { Loader2, CircleAlert } from '@lucide/svelte';
	import Toolbar from './toolbar/Toolbar.svelte';
	import SourceToolbar from './toolbar/SourceToolbar.svelte';
	import SearchBar from './SearchBar.svelte';
	import StarterPicker from './StarterPicker.svelte';
	import DiffPane from './DiffPane.svelte';
	import SourceEditor from './SourceEditor.svelte';
	import BibManager from './BibManager.svelte';
	import PDFViewer from './PDFViewer.svelte';
	import PreambleFrontmatter from './PreambleFrontmatter.svelte';
	import EditorView from '$lib/editor/EditorView.svelte';
	import type { EditSession } from '$lib/collab/editSession';
	import type { ParsedLatexFile } from '$lib/workspace/latexRoundtrip';
	import type { BibLaTeXReference } from '$lib/workspace/citations';
	import type { Starter, ImportedFile } from '$lib/workspace/starters';
	import { basename, dirname } from '$lib/workspace/fileSystem';
	import { activeFilePath } from '$lib/workspace/workspaceStore';
	import { m } from '$lib/paraglide/messages';

	type FileKind = 'tex' | 'bib' | 'pdf' | 'image' | 'binary' | 'text' | null;

	interface Props {
		loadedPath: string | null;
		kind: FileKind;
		viewMode: 'visual' | 'source' | 'diff';
		session: EditSession;
		folderEmpty: boolean;
		loadError: string | null;
		applyingStarter: boolean;
		texSource: string;
		rawContent: string;
		visualDoc: PMNode | null;
		docMeta: Pick<ParsedLatexFile, 'preamble' | 'postamble' | 'hadDocumentEnv'> | null;
		allReferences: BibLaTeXReference[];
		sourceGotoLine: { line: number; token: number; selectText?: string } | undefined;
		sourceScrollAnchor: { scroll: number | null; cursor: number | null } | null;
		sourceDiagnostics: NonNullable<ComponentProps<typeof SourceEditor>['diagnostics']>;
		diffOriginal: string;
		diffModified: string;
		diffLayout: 'unified' | 'split';
		diffLoading: boolean;
		diffError: string | null;
		diffHasHead: boolean;
		/** the workspace provider's URL builder: guests resolve through the session, not disk */
		fileUrl: (path: string) => string;
		onPickStarter: (s: Starter) => void;
		onBlankStarter: () => void;
		onImportStarter: (files: ImportedFile[]) => void;
		onTexInput: (v: string) => void;
		onRawInput: (v: string) => void;
		onVisualChange: (doc: PMNode) => void;
		onEditFrontmatter: (kind: string, inner: string) => void;
		onSyncToPdf: (line: number) => void;
		onHistoryBoundary: (dir: 'undo' | 'redo') => boolean;
		onJumpToFile: (name: string) => void;
		onOpenFileAt: (file: string, line: number, selectText?: string) => void;
		onToggleDiffLayout: () => void;
		onRefreshDiff: () => void;
		onExitDiff: () => void;
	}
	let {
		loadedPath,
		kind,
		viewMode,
		session,
		folderEmpty,
		loadError,
		applyingStarter,
		texSource,
		rawContent,
		visualDoc,
		docMeta,
		allReferences,
		sourceGotoLine,
		sourceScrollAnchor,
		sourceDiagnostics,
		diffOriginal,
		diffModified,
		diffLayout,
		diffLoading,
		diffError,
		diffHasHead,
		fileUrl,
		onPickStarter,
		onBlankStarter,
		onImportStarter,
		onTexInput,
		onRawInput,
		onVisualChange,
		onEditFrontmatter,
		onSyncToPdf,
		onHistoryBoundary,
		onJumpToFile,
		onOpenFileAt,
		onToggleDiffLayout,
		onRefreshDiff,
		onExitDiff
	}: Props = $props();

	// remounts the source editor when the file or the session's view of it changes
	const sourceKey = $derived(`${loadedPath}:${session.active}:${session.manifestRev}`);
</script>

<div class="flex min-h-0 min-w-0 flex-col" style="grid-column: 1; grid-row: 2">
	{#if visualDoc && loadedPath && kind === 'tex' && viewMode === 'visual'}
		<div class="border-surface-200-800 toolbar-hscroll overflow-x-auto border-b">
			<Toolbar minimal />
		</div>
	{:else if loadedPath && kind === 'tex' && viewMode === 'source'}
		<div class="border-surface-200-800 toolbar-hscroll overflow-x-auto border-b px-2 py-1.5">
			<SourceToolbar />
		</div>
	{/if}
	<!-- relative anchors the floating find bar; it sits outside the scroller so it doesn't scroll away -->
	<div class="relative min-h-0 min-w-0 flex-1">
		{#if loadedPath && kind === 'tex' && viewMode === 'visual' && visualDoc}
			<SearchBar />
		{/if}
		<div class="h-full w-full overflow-auto">
			{#if folderEmpty && !$activeFilePath}
				<div class="mx-auto mt-16 max-w-xl px-6">
					<div class="text-center">
						<h2 class="text-lg font-semibold">{m.wsview_start_new_doc_heading()}</h2>
						<p class="text-surface-500 mt-1 text-sm">
							{m.wsview_start_new_doc_desc_pre()} <code>.tex</code>
							{m.wsview_start_new_doc_desc_post()}
						</p>
					</div>
					<div class="mt-6">
						<StarterPicker onPick={onPickStarter} onBlank={onBlankStarter} onImport={onImportStarter} busy={applyingStarter} />
					</div>
				</div>
			{:else if loadError}
				<div class="text-error-600 mx-auto mt-12 flex max-w-md flex-col items-center gap-2 text-center">
					<CircleAlert class="size-8" />
					<p class="text-sm">{loadError}</p>
				</div>
			{:else if loadedPath && viewMode === 'diff' && (kind === 'tex' || kind === 'bib' || kind === 'text')}
				<DiffPane
					filename={loadedPath}
					original={diffOriginal}
					modified={diffModified}
					layout={diffLayout}
					loading={diffLoading}
					error={diffError}
					hasHead={diffHasHead}
					onToggleLayout={onToggleDiffLayout}
					onRefresh={onRefreshDiff}
					onExit={onExitDiff}
				/>
			{:else if loadedPath && kind === 'tex' && viewMode === 'source'}
				{#key sourceKey}
					<SourceEditor
						value={texSource}
						onInput={onTexInput}
						gotoLine={sourceGotoLine}
						{onSyncToPdf}
						initialScrollPos={sourceScrollAnchor}
						{onHistoryBoundary}
						diagnostics={sourceDiagnostics}
						{onJumpToFile}
						{onOpenFileAt}
						collab={session.collabFor(loadedPath)}
					/>
				{/key}
			{:else if loadedPath && kind === 'tex' && visualDoc}
				{#key loadedPath}
					<!-- texpile-main-editor scopes the editor's right-click context menu (ContextMenu.svelte) -->
					<!-- px-12 reserves room for the block-handle gutters (~48px left / ~30px right); on narrow
				     windows the mx-auto centering margin collapses and this padding keeps them from clipping -->
					<div class="px-12 py-8">
						<div class="texpile-main-editor mx-auto w-full max-w-3xl min-w-0">
							{#if docMeta?.hadDocumentEnv}
								<PreambleFrontmatter preamble={docMeta.preamble} onEdit={onEditFrontmatter} />
							{/if}
							<EditorView
								localValue={visualDoc}
								localReferences={allReferences}
								imageDir={dirname(loadedPath)}
								onLocalChange={onVisualChange}
								placeholder={m.wsview_editor_placeholder()}
								{onHistoryBoundary}
							/>
						</div>
					</div>
				{/key}
			{:else if loadedPath && kind === 'bib' && viewMode === 'source'}
				{#key sourceKey}
					<SourceEditor
						value={rawContent}
						onInput={onRawInput}
						filename={loadedPath}
						gotoLine={sourceGotoLine}
						collab={session.collabFor(loadedPath)}
					/>
				{/key}
			{:else if loadedPath && kind === 'bib'}
				{#key loadedPath}
					<BibManager value={rawContent} onInput={onRawInput} />
				{/key}
			{:else if loadedPath && kind === 'text'}
				{#key sourceKey}
					<SourceEditor
						value={rawContent}
						onInput={onRawInput}
						filename={loadedPath}
						gotoLine={sourceGotoLine}
						collab={session.collabFor(loadedPath)}
					/>
				{/key}
			{:else if loadedPath && kind === 'pdf'}
				<!-- a .pdf opened directly: its own src, independent of the compile-output pane -->
				<div class="h-full w-full">
					<PDFViewer src={fileUrl(loadedPath)} filename={basename(loadedPath)} />
				</div>
			{:else if loadedPath && kind === 'image'}
				<div class="flex h-full items-center justify-center p-8">
					<img src={fileUrl(loadedPath)} alt={basename(loadedPath)} class="max-h-full max-w-full object-contain" />
				</div>
			{:else if loadedPath && kind === 'binary'}
				<div class="text-surface-500 mt-12 text-center text-sm">
					{m.wsview_binary_file_note({ name: basename(loadedPath) })}
				</div>
			{:else if $activeFilePath}
				<div class="text-surface-500 mt-12 flex items-center justify-center gap-2 text-sm">
					<Loader2 class="size-4 animate-spin" />
					{m.wsview_opening()}
				</div>
			{:else}
				<div class="text-surface-500 mt-12 text-center text-sm">{m.wsview_select_file_prompt()}</div>
			{/if}
		</div>
	</div>
</div>
