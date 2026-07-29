<script lang="ts">
	// The editor column: toolbar, editor/preview pair, and the bottom dock. Everything here reads
	// from the workspace's state objects rather than a long list of scalar props, which is what
	// makes this splittable at all - the state lives in lib/workspace/*.svelte.ts, not in the view.
	import EditorTopbar from '$lib/editor/comp/EditorTopbar.svelte';
	import EditorPane from '$lib/editor/comp/EditorPane.svelte';
	import PreviewPane from '$lib/editor/comp/PreviewPane.svelte';
	import TerminalDock from '$lib/editor/comp/TerminalDock.svelte';
	import type DraftView from '$lib/draft/DraftView.svelte';
	import type { DocumentBuffer, FileKind } from '$lib/workspace/documentBuffer.svelte';
	import type { ViewModeSwitch } from '$lib/workspace/viewModeSwitch.svelte';
	import type { PaneLayout } from '$lib/workspace/paneLayout.svelte';
	import type { DiffMode } from '$lib/workspace/diffMode.svelte';
	import type { VisualParser } from '$lib/workspace/visualParse.svelte';
	import type { TerminalDockState } from '$lib/workspace/terminalDockState.svelte';

	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the pipelines are structural here
	type Any = any;

	let {
		doc,
		modes,
		layout = $bindable(),
		diff,
		parser,
		termDock = $bindable(),
		compiler,
		saver,
		session,
		guest,
		kind,
		nameOnly,
		folderEmpty,
		modLabel,
		dockShrunk,
		draft,
		panes,
		actions,
		dockView = $bindable(),
		pdfPaneRef = $bindable(),
		draftRef = $bindable()
	}: {
		doc: DocumentBuffer;
		modes: ViewModeSwitch;
		layout: PaneLayout;
		diff: DiffMode;
		parser: VisualParser;
		termDock: TerminalDockState;
		compiler: Any;
		saver: Any;
		session: Any;
		guest: boolean;
		kind: FileKind;
		nameOnly: boolean;
		folderEmpty: boolean;
		modLabel: string;
		dockShrunk: boolean;
		/** live-preview inputs: root, main file, recompile trigger, paused flag */
		draft: { root: string; mainRel: string; trigger: number; paused: boolean };
		/** editor inputs that are not workspace state: tabs, references, jump targets */
		panes: Any;
		actions: Any;
		dockView: 'terminal' | 'problems';
		pdfPaneRef: Any;
		draftRef: DraftView | null;
	} = $props();
</script>

<main
	class="grid min-h-0 min-w-0 flex-1"
	style="grid-template-columns: minmax(0, 1fr) auto auto; grid-template-rows: auto minmax(0, 1fr) auto auto"
>
	<EditorTopbar
		loadedPath={doc.path}
		{kind}
		viewMode={modes.mode}
		{guest}
		terminalAvailable={termDock.available}
		compiling={compiler.compiling}
		pdfPaneOpen={layout.pdfPaneOpen}
		draftPaused={draft.paused}
		saving={saver.saving}
		sidebarOpen={layout.sidebarOpen}
		{modLabel}
		onToggleSidebar={layout.toggleSidebar}
		onSetViewMode={actions.setViewMode}
		onSyncForward={actions.syncForward}
		onStopCompile={compiler.stopCompile}
		onPauseDraft={actions.pauseDraft}
		onResumeDraft={actions.resumeDraft}
		onCompile={compiler.runCompile}
		onRequestCompile={actions.requestCompile}
		onConfigureCompile={actions.openCompileModal}
		onShowProblems={actions.showProblems}
		onTogglePdf={layout.togglePdfPane}
		onSave={actions.save}
	/>

	<!-- editor column (toolbar + content) with the PDF pane beside it, so the PDF skips the
	     toolbar while the header (Compile) stays above it. the wrapper is display:contents so
	     editor/splitter/preview place themselves on main's grid -->
	<div class="contents">
		<EditorPane
			openTabs={panes.openTabs}
			onActivateTab={actions.activateTab}
			onCloseTab={actions.closeTab}
			loadedPath={doc.path}
			{kind}
			{nameOnly}
			viewMode={modes.mode}
			{session}
			{folderEmpty}
			loadError={doc.loadError}
			applyingStarter={panes.applyingStarter}
			texSource={doc.texSource}
			rawContent={doc.rawContent}
			visualDoc={doc.visualDoc}
			parseProgress={parser.progress}
			onUseSource={actions.useSource}
			docMeta={doc.docMeta}
			allReferences={panes.allReferences}
			sourceGotoLine={panes.sourceGotoLine}
			sourceScrollAnchor={modes.sourceScrollAnchor}
			sourceDiagnostics={panes.sourceDiagnostics}
			diffOriginal={diff.original}
			diffModified={diff.modified}
			diffLayout={diff.layout}
			diffLoading={diff.loading}
			diffError={diff.error}
			diffHasHead={diff.hasHead}
			fileUrl={panes.fileUrl}
			onPickStarter={actions.pickStarter}
			onBlankStarter={actions.newTexFile}
			onImportStarter={actions.importStarter}
			onTexInput={actions.onTexInput}
			onRawInput={actions.onRawInput}
			onVisualChange={actions.onVisualChange}
			onVisualSelection={actions.onVisualSelection}
			onEditFrontmatter={actions.onEditFrontmatter}
			onSyncToPdf={actions.syncToPdf}
			onHistoryBoundary={actions.historyStep}
			onJumpToFile={actions.jumpToFile}
			onOpenFileAt={actions.openFileAt}
			onToggleDiffLayout={() => diff.toggleLayout()}
			onRefreshDiff={actions.refreshDiff}
			onExitDiff={actions.exitDiff}
		/>
		{#if layout.pdfPaneOpen}
			<PreviewPane
				width={layout.pdfPaneWidth}
				{dockShrunk}
				{guest}
				guestPdf={session.guestPdf}
				pdfFilename={compiler.pdfFilename}
				draftRoot={draft.root}
				draftMainRel={draft.mainRel}
				draftTrigger={draft.trigger}
				bind:pdfPaneRef
				bind:draftRef
				onStartResize={layout.startPdfResize}
				onResizeByKey={layout.resizePdfByKey}
				onClose={layout.togglePdfPane}
				onPageClick={actions.onPdfDoubleClick}
				onInverseSync={actions.onInverseSync}
				onSettled={actions.onPreviewSettled}
			/>
		{/if}
	</div>

	{#if termDock.mounted && (termDock.available || guest)}
		<TerminalDock
			terminalEnabled={termDock.available}
			visible={termDock.visible}
			height={termDock.height}
			shrink={termDock.shrink}
			{dockShrunk}
			cwd={panes.cwd}
			pdfPaneOpen={layout.pdfPaneOpen}
			bind:view={dockView}
			bind:dock={termDock.dock}
			onStartResize={termDock.startResize}
			onResizeByKey={termDock.resizeByKey}
			onToggleShrink={actions.toggleTerminalShrink}
			onClose={actions.toggleTerminal}
			onProblemJump={actions.openFileAt}
		/>
	{/if}
</main>
