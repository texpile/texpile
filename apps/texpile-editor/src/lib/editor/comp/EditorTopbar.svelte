<script lang="ts">
	// The editor's top bar: sidebar toggle, filename + unsaved dot + word count, the visual/source
	// toggle, and the compile / preview / save controls. Pure chrome driven by props + callbacks.
	import { basename } from '$lib/workspace/fileSystem';
	import { settings } from '$lib/settings';
	import { isDirty } from '$lib/workspace/workspaceStore';
	import { compileLog } from '$lib/stores/compileLogStore';
	import WordCount from './WordCount.svelte';
	import { m } from '$lib/paraglide/messages';
	import {
		PanelLeft,
		PanelRight,
		FileText,
		Eye,
		Code,
		LocateFixed,
		Square,
		Play,
		ChevronDown,
		Settings2,
		CircleAlert,
		TriangleAlert,
		Save,
		Loader2
	} from '@lucide/svelte';

	interface Props {
		loadedPath: string | null;
		kind: string;
		viewMode: 'visual' | 'source' | 'diff';
		guest: boolean;
		terminalAvailable: boolean;
		compiling: boolean;
		pdfPaneOpen: boolean;
		draftPaused: boolean;
		saving: boolean;
		sidebarOpen: boolean;
		modLabel: string;
		onToggleSidebar: () => void;
		onSetViewMode: (m: 'visual' | 'source') => void;
		onSyncForward: () => void;
		onStopCompile: () => void;
		onPauseDraft: () => void;
		onResumeDraft: () => void;
		onCompile: () => void;
		onConfigureCompile: () => void;
		onShowProblems: () => void;
		onTogglePdf: () => void;
		onSave: () => void;
	}
	let {
		loadedPath,
		kind,
		viewMode,
		guest,
		terminalAvailable,
		compiling,
		pdfPaneOpen,
		draftPaused,
		saving,
		sidebarOpen,
		modLabel,
		onToggleSidebar,
		onSetViewMode,
		onSyncForward,
		onStopCompile,
		onPauseDraft,
		onResumeDraft,
		onCompile,
		onConfigureCompile,
		onShowProblems,
		onTogglePdf,
		onSave
	}: Props = $props();

	let compileMenuOpen = $state(false);
</script>

<header class="border-surface-200-800 col-span-full flex h-12 items-center justify-between gap-3 border-b px-4">
	<div class="flex min-w-0 items-center gap-2">
		<button
			class="btn-icon btn-icon-sm hover:preset-tonal shrink-0"
			onclick={onToggleSidebar}
			title={sidebarOpen ? m.wsview_hide_file_explorer() : m.wsview_show_file_explorer()}
			aria-label={m.wsview_toggle_file_explorer_aria()}
		>
			<PanelLeft class="size-4" />
		</button>
		<FileText class="text-surface-400 size-4 shrink-0" />
		<span class="truncate text-sm font-medium">{loadedPath ? basename(loadedPath) : m.wsview_no_file()}</span>
		{#if $isDirty && !guest}<span class="bg-warning-500 size-2 shrink-0 rounded-full" title={m.wsview_unsaved_changes()}></span>{/if}
		{#if loadedPath && kind === 'tex' && (viewMode === 'visual' || viewMode === 'source')}
			<span class="border-surface-300-700 ml-2 shrink-0 border-l pl-3"><WordCount /></span>
		{/if}
	</div>
	<div class="flex items-center gap-2">
		{#if loadedPath && (kind === 'tex' || kind === 'bib') && !guest}
			<!-- visual/source toggle; for .bib it's the reference editor vs raw BibTeX. guests are source-only -->
			<div class="border-surface-300-700 inline-flex shrink-0 overflow-hidden rounded-md border text-xs">
				<button
					class="flex items-center gap-1 px-2.5 py-1 {viewMode === 'visual' ? 'preset-filled-primary-500' : 'hover:preset-tonal'}"
					onclick={() => onSetViewMode('visual')}
					title={m.wsview_visual_editor_title()}
				>
					<Eye class="size-3.5" />
					{m.wsview_visual_label()}
				</button>
				<button
					class="flex items-center gap-1 px-2.5 py-1 {viewMode === 'source' ? 'preset-filled-primary-500' : 'hover:preset-tonal'}"
					onclick={() => onSetViewMode('source')}
					title={m.wsview_latex_source_title()}
				>
					<Code class="size-3.5" />
					{m.wsview_source_label()}
				</button>
			</div>
		{/if}
		{#if guest && loadedPath && kind === 'tex'}
			<!-- forward SyncTeX: the host resolves the position and we scroll our PDF copy -->
			<button
				class="btn-icon btn-icon-sm hover:preset-tonal"
				onclick={onSyncForward}
				title={m.wsview_sync_to_pdf_title()}
				aria-label={m.wsview_sync_to_pdf_aria()}
			>
				<LocateFixed class="size-4" />
			</button>
		{/if}
		{#if terminalAvailable}
			{#if viewMode === 'source' && kind === 'tex'}
				<button
					class="btn-icon btn-icon-sm hover:preset-tonal"
					onclick={onSyncForward}
					title={m.wsview_sync_to_pdf_title()}
					aria-label={m.wsview_sync_to_pdf_aria()}
				>
					<LocateFixed class="size-4" />
				</button>
			{/if}
			<!-- Compile / Stop with an attached options caret (Overleaf-style) -->
			<div class="relative flex items-center">
				{#if compiling}
					<button
						class="btn btn-sm preset-tonal-error w-20 justify-center gap-1.5 rounded-r-none"
						onclick={onStopCompile}
						title={m.wsview_stop_compile_title({ combo: `${modLabel}+Alt+Enter` })}
					>
						<Square class="size-4" />
						{m.wsview_stop_label()}
					</button>
				{:else if $settings.draftMode && pdfPaneOpen && !draftPaused}
					<button
						class="btn btn-sm preset-tonal-success min-w-24 justify-center gap-1.5 rounded-r-none whitespace-nowrap"
						onclick={onPauseDraft}
						title={m.wsview_live_preview_running_title()}
					>
						<span class="bg-success-500 size-2 animate-pulse rounded-full"></span>
						{m.wsview_live_label()}
					</button>
				{:else if $settings.draftMode && pdfPaneOpen && draftPaused}
					<button
						class="btn btn-sm preset-tonal-warning min-w-24 justify-center gap-1.5 rounded-r-none whitespace-nowrap"
						onclick={onResumeDraft}
						title={m.wsview_engine_stopped_title()}
					>
						<Play class="size-4" />
						{m.wsview_paused_label()}
					</button>
				{:else}
					<button
						class="btn btn-sm preset-tonal-primary w-24 justify-center gap-1.5 rounded-r-none"
						onclick={onCompile}
						title={$settings.draftMode ? m.wsview_open_live_preview_title() : m.wsview_compile_title({ combo: `${modLabel}+Alt+Enter` })}
					>
						<Play class="size-4" />
						{$settings.draftMode ? m.wsview_preview_label() : m.wsview_compile_label()}
					</button>
				{/if}
				<button
					class="btn btn-sm {compiling
						? 'preset-tonal-error'
						: $settings.draftMode && pdfPaneOpen
							? draftPaused
								? 'preset-tonal-warning'
								: 'preset-tonal-success'
							: 'preset-tonal-primary'} rounded-l-none border-l border-black/10 px-1"
					onclick={() => (compileMenuOpen = !compileMenuOpen)}
					title={m.wsview_compile_options()}
					aria-label={m.wsview_compile_options()}
					aria-haspopup="menu"
					aria-expanded={compileMenuOpen}
				>
					<ChevronDown class="size-3.5 transition-transform {compileMenuOpen ? 'rotate-180' : ''}" />
				</button>
				{#if compileMenuOpen}
					<!-- click-away layer -->
					<button class="fixed inset-0 z-1200 cursor-default" onclick={() => (compileMenuOpen = false)} tabindex="-1" aria-hidden="true"
					></button>
					<div class="card bg-surface-50-950 border-surface-300-700 absolute top-full right-0 z-1300 mt-1 w-max border p-1 shadow-xl">
						<button
							class="hover:preset-tonal flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm whitespace-nowrap"
							onclick={() => {
								compileMenuOpen = false;
								onConfigureCompile();
							}}
						>
							<Settings2 class="size-4 shrink-0" />
							{m.wsview_configure_compile_command()}
						</button>
					</div>
				{/if}
			</div>
			{#if $compileLog && ($compileLog.errors.length > 0 || $compileLog.warnings.length > 0)}
				<button
					class="btn btn-sm gap-1 {$compileLog.errors.length > 0 ? 'preset-tonal-error' : 'preset-tonal-warning'}"
					onclick={onShowProblems}
					title={m.wsview_show_problems_title()}
				>
					{#if $compileLog.errors.length > 0}
						<CircleAlert class="size-3.5" /> {$compileLog.errors.length}
					{/if}
					{#if $compileLog.warnings.length > 0}
						<TriangleAlert class="size-3.5" /> {$compileLog.warnings.length}
					{/if}
				</button>
			{/if}
			<button
				class="btn-icon btn-icon-sm hover:preset-tonal {pdfPaneOpen ? 'text-primary-500' : ''}"
				onclick={onTogglePdf}
				title={m.wsview_toggle_pdf_preview()}
				aria-label={m.wsview_toggle_pdf_preview()}
			>
				<PanelRight class="size-4" />
			</button>
		{/if}
		{#if !guest}
			<!-- guests have nothing to save: their edits sync live through the shared doc -->
			<button class="btn btn-sm preset-filled-primary-500 gap-1.5" onclick={onSave} disabled={!loadedPath || saving || !$isDirty}>
				{#if saving}<Loader2 class="size-4 animate-spin" />{:else}<Save class="size-4" />{/if}
				{m.wsview_save_label()}
			</button>
		{/if}
	</div>
</header>
