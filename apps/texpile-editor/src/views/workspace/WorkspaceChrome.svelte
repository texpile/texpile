<script lang="ts">
	// The workspace's chrome: the menu bar (or the guest banner in its place) and the left sidebar
	// with its drag handle. Like WorkspaceMain, this reads from the shared state objects rather
	// than a long prop list.
	import TitleBar from '$lib/chrome/TitleBar.svelte';
	import WorkspaceMenuBar from '$lib/chrome/WorkspaceMenuBar.svelte';
	import SessionPresence from '$lib/chrome/SessionPresence.svelte';
	import WorkspaceSidebar from './WorkspaceSidebar.svelte';
	import GuestPresence from '$lib/collab/GuestPresence.svelte';
	import WindowDialogs from '$lib/modals/window/WindowDialogs.svelte';
	import PaneSplitter from '$lib/components/PaneSplitter.svelte';
	import { ChevronLeft, ChevronRight, ShieldQuestion } from '@lucide/svelte';
	import type GlobalSearch from '$lib/search/GlobalSearch.svelte';
	import type { PaneLayout } from '$lib/workspace/paneLayout.svelte';
	import type { ViewModeSwitch } from '$lib/workspace/viewModeSwitch.svelte';
	import type { TerminalDockState } from '$lib/workspace/terminalDockState.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { Snippet } from 'svelte';

	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the pipelines are structural here
	type Any = any;

	let {
		children,
		layout = $bindable(),
		modes,
		termDock = $bindable(),
		compiler,
		scm,
		treeOps,
		guest,
		modLabel,
		showToc,
		menu,
		actions,
		pendingCommand = null,
		fileTreeRef = $bindable(),
		globalSearchRef = $bindable()
	}: {
		/** the editor column, rendered as a sibling of the sidebar inside the row */
		children: Snippet;
		layout: PaneLayout;
		modes: ViewModeSwitch;
		termDock: TerminalDockState;
		compiler: Any;
		scm: Any;
		treeOps: Any;
		guest: boolean;
		modLabel: string;
		showToc: boolean;
		/** menu-bar inputs that are not workspace state */
		menu: {
			disabled: boolean;
			/** kind of the open file; the menus adapt to what it supports (see WorkspaceMenuBar) */
			fileKind: import('$lib/workspace/documentBuffer.svelte').FileKind;
			imageDir: string | undefined;
			shareable: boolean;
			/** provider.caps.manageTree: the workspace takes tree writes */
			hostMode: boolean;
			canFormat: boolean;
			uiZoomPercent: number;
			/** the compile target is Typst; New-file menus offer .typ instead of .tex/.cls/.sty */
			typstProject: boolean;
			/** citation picker available (inserting into the bibliography works) */
			libraryCite: boolean;
		};
		actions: Any;
		/** a compile command from .texpile/config.json awaiting acceptance; see projectConfig.ts.
		 * Window-wide because it gates compiling, not just this file's editor. */
		pendingCommand?: { command: string } | null;
		fileTreeRef: Any;
		globalSearchRef: GlobalSearch | null;
	} = $props();
</script>

<!-- One title bar for both roles. A guest used to get a bare one, which meant no menus on Windows
     and - worse - the stock Electron app menu plus Edit on macOS, since WorkspaceMenuBar is what
     publishes menu state to main and it was never mounted. Most of the bar is legitimately a
     guest's: it edits the document, so Edit, Insert, Format, Spelling, View and Help all apply.
     What a guest cannot do is withheld by not passing the callback, the way Share session already
     worked, so the in-app bar and the native one drop the same items from one decision.
     On macOS the component mounts and draws no triggers; the system menu bar has them. -->
<TitleBar>
	{#snippet status()}
		{#if guest}
			<GuestPresence />
		{:else}
			<SessionPresence onShareSession={menu.shareable ? actions.openShare : undefined} />
		{/if}
	{/snippet}
	{#snippet menus()}
		<WorkspaceMenuBar
			disabled={menu.disabled}
			fileKind={menu.fileKind}
			imageDir={menu.imageDir}
			onNewFile={menu.hostMode ? actions.newFileOfType : undefined}
			typstProject={menu.typstProject}
			onOpenFolder={menu.hostMode ? actions.openFolder : undefined}
			onCloseWorkspace={menu.hostMode ? actions.closeWorkspace : undefined}
			onSave={actions.save}
			onShareSession={menu.shareable ? actions.openShare : undefined}
			terminalAvailable={termDock.available}
			terminalVisible={termDock.visible}
			onCompile={compiler.runCompile}
			onConfigureCompile={actions.openCompileModal}
			onNewTerminal={actions.newTerminal}
			onToggleTerminal={actions.toggleTerminal}
			onFormatDocument={menu.canFormat ? actions.openFormatModal : undefined}
			onOpenTutorial={actions.openTutorial}
			uiZoomPercent={menu.uiZoomPercent}
			onZoomIn={actions.uiZoomIn}
			onZoomOut={actions.uiZoomOut}
			onZoomReset={actions.uiZoomReset}
			onPickCitation={menu.libraryCite ? () => actions.insertLibraryCitation() : undefined}
		/>
	{/snippet}
</TitleBar>

<!-- outside the branch on purpose: a guest reaches Preferences through the palette and has no menu
     bar to have mounted these -->
<WindowDialogs />

{#if pendingCommand}
	<!-- The one setting in .texpile/config.json that Texpile EXECUTES, so it is the one that has to
	     be accepted rather than applied.
	     Across the whole window, under the title bar, rather than above the editor: it is a question
	     about the PROJECT, not about the file you happen to have open, and compiling is blocked
	     until it is answered (compilePipeline.runCompile) - so it must not sit in a column that a
	     closed sidebar or a wide preview can push out of view.
	     Still not a modal: you can keep reading and editing while you decide. -->
	<div class="border-warning-500/40 bg-warning-500/10 flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b px-3 py-2 text-xs">
		<ShieldQuestion class="text-warning-600-400 size-4 shrink-0" />
		<span>{m.project_command_prompt()}</span>
		<code class="bg-surface-200-800 min-w-0 truncate rounded px-1.5 py-0.5 font-mono" title={pendingCommand.command}>
			{pendingCommand.command}
		</code>
		<span class="text-surface-500-400" title={m.project_command_why()}>({m.project_command_why()})</span>
		<!-- Two ways to ANSWER, not one answer and one dismissal. The other button used to be "Keep
		     mine", which only cleared the bar: it recorded nothing, so the question came back on every
		     reopen - and now that compiling is held until this is settled, that meant starting blocked
		     every session. Configure opens the dialog, where saving writes your command to the file
		     and settles the disagreement for everyone, not just for this window.
		     The accepting one on the RIGHT, where a dialog's confirm sits. -->
		<div class="ml-auto flex shrink-0 items-center gap-1">
			<button class="btn btn-xs hover:preset-tonal" onclick={actions.openCompileModal}>{m.wsview_configure_compile_command()}</button>
			<button class="btn btn-xs preset-filled-primary-500" onclick={actions.acceptProjectCommand}>{m.project_command_use()}</button>
		</div>
	</div>
{/if}

<div class="flex min-h-0 flex-1 overflow-hidden">
	{#if layout.sidebarOpen}
		<WorkspaceSidebar
			width={layout.sidebarWidth}
			{guest}
			{modLabel}
			bind:view={layout.sidebarView}
			scmBusy={scm.busy}
			{showToc}
			tocFraction={layout.tocFraction}
			historyFraction={layout.historyFraction}
			viewMode={modes.mode}
			bind:fileTreeRef
			bind:globalSearchRef
			bind:splitEl={layout.splitEl}
			bind:scmSplitEl={layout.scmSplitEl}
			onRefreshTree={actions.refreshTree}
			onOpenGlobalSearch={actions.openGlobalSearch}
			onCloseGlobalSearch={actions.closeGlobalSearch}
			onOpenFileAt={actions.openFileAt}
			onOpenEntry={actions.openEntry}
			onCreate={treeOps.create}
			typstProject={menu.typstProject}
			onRename={treeOps.rename}
			onDelete={treeOps.deleteMany}
			onMove={treeOps.moveMany}
			onImport={treeOps.import}
			onCopyIn={treeOps.copyIn}
			onSetMain={actions.setMain}
			onReveal={actions.revealEntry}
			fileHistory={treeOps.history}
			onStartTocResize={layout.startTocResize}
			onResizeTocByKey={layout.resizeTocByKey}
			onStartHistoryResize={layout.startHistoryResize}
			onResizeHistoryByKey={layout.resizeHistoryByKey}
			onRefreshGit={actions.refreshGit}
			scmInit={scm.init}
			scmDiscard={scm.discard}
			scmCommit={scm.commit}
			scmRestore={scm.restore}
			scmIgnoreArtifacts={scm.ignoreArtifacts}
			scmCompare={scm.compare}
			scmChangesSince={scm.changesSince}
			scmOpenDiff={scm.openDiff}
		/>
	{/if}

	<!-- kept outside the branch: with the sidebar shut this is the editor's left edge and the way
	     back in, since the toolbar toggle is gone. It stays draggable while shut - pulling it into
	     the window reopens the sidebar, the other half of drag-to-close - and the chevron turns
	     round.

	     topInset 48 = EditorTopbar's h-12. This column runs the full height of the window while the
	     preview's divider starts below that toolbar, so without it the drag zone would reach up
	     beside the toolbar and the two toggles would sit at different heights.

	     ml-[7px] only once the sidebar is shut, when this becomes the first item in the row and its
	     rule lands on the window edge: the lozenge is 7px but its chevron is 14px, so the glyph
	     needs 7px of clearance or the edge cuts it in half. Open, it has panes on both sides and
	     needs none. The preview says the same thing with a plain mr-[7px] because its closed state
	     is a second instance that only ever exists at the edge. -->
	<PaneSplitter
		topInset={48}
		resizable
		resizeLabel={m.wsview_resize_sidebar_aria()}
		onStartResize={layout.startSidebarResize}
		onResizeByKey={layout.resizeSidebarByKey}
		toggle={{
			icon: layout.sidebarOpen ? ChevronLeft : ChevronRight,
			onclick: layout.toggleSidebar,
			title: layout.sidebarOpen ? m.wsview_hide_file_explorer() : m.wsview_show_file_explorer(),
			ariaLabel: m.wsview_toggle_file_explorer_aria()
		}}
		class="z-20 {layout.sidebarOpen ? '' : 'ml-[7px]'}"
	/>

	{@render children()}
</div>
