<script lang="ts">
	// The editor's top bar: sidebar toggle, word count, the visual/source toggle, and the
	// compile / preview / save controls. Pure chrome driven by props + callbacks. The open-file
	// tabs live on their own strip below (TabBar in EditorPane).
	import { tip } from '$lib/components/tooltip.svelte';
	import { openWorkspaceForFile } from '$lib/workspace/openWorkspace';
	import { fileMode } from '$lib/workspace/fileMode.svelte';
	import { compileConfig } from '$lib/workspace/projectConfigSync.svelte';
	import { isDirty } from '$lib/workspace/workspaceStore';
	import { compileLog } from '$lib/stores/compileLogStore';
	import WordCount from './WordCount.svelte';
	import CompileButton, { COMPILE_TONE } from '$lib/preview/CompileButton.svelte';
	import type { ComponentProps } from 'svelte';
	import type { FileKind } from '$lib/workspace/documentBuffer.svelte';
	import { m } from '$lib/paraglide/messages';
	import {
		ArrowRight,
		FileText,
		Eye,
		Code,
		Square,
		Play,
		ChevronDown,
		Settings2,
		CircleAlert,
		TriangleAlert,
		Save,
		Loader2,
		ShieldQuestion,
		MessageSquare,
		FolderOpen
	} from '@lucide/svelte';

	type Props = {
		loadedPath: string | null;
		kind: FileKind;
		viewMode: 'visual' | 'source' | 'diff';
		encodingIssue?: string | null;
		guest: boolean;
		terminalAvailable: boolean;
		compiling: boolean;
		/** the preview pane is (or is about to be) a Typst live preview; see WorkspaceView */
		typstPreviewWanted: boolean;
		/** guest only: the host streams its live Typst preview, so there is no compile to request */
		guestTypstOffered?: boolean;
		pdfPaneOpen: boolean;
		draftPaused: boolean;
		saving: boolean;
		modLabel: string;
		onSetViewMode: (m: 'visual' | 'source') => void;
		onStopCompile: () => void;
		onPauseDraft: () => void;
		onResumeDraft: () => void;
		onCompile: () => void;
		/** the project asks for an unaccepted compile command; the slot shows blocked (see runCompile) */
		commandPending?: boolean;
		/** guest only: ask the host to compile (it owns the toolchain). */
		onRequestCompile: () => void;
		onConfigureCompile: () => void;
		onShowProblems: () => void;
		/** open review threads in the project; 0 hides the badge, like a clean compile hides Problems */
		commentCount?: number;
		onShowComments?: () => void;
		onTogglePdf: () => void;
		onSave: () => void;
		/**
		 * One-shot sync of the preview to the caret, shown ONLY while the preview is popped out
		 * into its own window: docked, the chip on the pane divider is that button, and it leaves
		 * with the pane. Null hides it.
		 */
		onSyncToCursor?: (() => void) | null;
		/** flavors the sync button's tooltip: live preview wording vs SyncTeX wording */
		syncTargetsPreview?: boolean;
	};
	let {
		loadedPath,
		kind,
		viewMode,
		encodingIssue = null,
		guest,
		terminalAvailable,
		compiling,
		typstPreviewWanted,
		guestTypstOffered = false,
		pdfPaneOpen,
		draftPaused,
		saving,
		modLabel,
		onSetViewMode,
		onStopCompile,
		onPauseDraft,
		onResumeDraft,
		onCompile,
		commandPending = false,
		onRequestCompile,
		onConfigureCompile,
		onShowProblems,
		commentCount = 0,
		onShowComments = () => {},
		onTogglePdf,
		onSave,
		onSyncToCursor = null,
		syncTargetsPreview = false
	}: Props = $props();

	let compileMenuOpen = $state(false);

	// Typst's Preview replaces Compile the way LaTeX's live mode does: same slot, same states.
	// Driven by the same flag the preview pane branches on - sticky across tabs - so the green
	// Live button does not flip back to Compile when a .bib or an image has focus.
	const typstLive = $derived(typstPreviewWanted);

	/**
	 * What the compile slot is right now: colour, icon, label and click, in one place.
	 *
	 * The state used to be a five-branch chain of near-identical <button> blocks, with the
	 * conditions repeated a sixth time to colour the chevron - so the two could disagree, and did.
	 * One descriptor drives both.
	 */
	const compile = $derived.by((): ComponentProps<typeof CompileButton> => {
		// The project names a command this machine has not accepted: nothing compiles until the
		// banner is answered, so the button says so instead of looking live and refusing on click.
		// This is presentation only - runCompile holds the actual gate, for the six other ways in.
		if (commandPending)
			return {
				tone: 'warning',
				icon: ShieldQuestion,
				label: m.wsview_compile_label(),
				title: m.project_command_blocked_desc(),
				disabled: true,
				onclick: () => {}
			};
		if (compiling)
			return {
				tone: 'error',
				icon: Square,
				label: m.wsview_stop_label(),
				title: m.wsview_stop_compile_title({ combo: `${modLabel}+Alt+Enter` }),
				onclick: onStopCompile
			};
		// the preview is attached; closing the pane is its stop (the pane detaches the server task
		// on close), so this is both indicator and off switch
		if (typstLive && pdfPaneOpen)
			return { tone: 'success', dot: true, label: m.wsview_live_label(), title: m.wsview_typst_preview_live_title(), onclick: onTogglePdf };
		if (compileConfig.current.latex.liveMode && pdfPaneOpen) {
			if (draftPaused)
				return {
					tone: 'warning',
					icon: Play,
					label: m.wsview_paused_label(),
					title: m.wsview_engine_stopped_title(),
					onclick: onResumeDraft
				};
			return {
				tone: 'success',
				dot: true,
				label: m.wsview_live_label(),
				title: m.wsview_live_preview_running_title(),
				onclick: onPauseDraft
			};
		}
		const live = typstLive || compileConfig.current.latex.liveMode;
		return {
			tone: 'primary',
			icon: Play,
			label: live ? m.wsview_preview_label() : m.wsview_compile_label(),
			title: live ? m.wsview_open_live_preview_title() : m.wsview_compile_title({ combo: `${modLabel}+Alt+Enter` }),
			onclick: onCompile
		};
	});
</script>

<header class="border-surface-200-800 col-span-full flex h-12 items-center justify-between gap-3 border-b px-4">
	<!-- the sidebar and preview toggles used to bracket this row. Both moved onto the divider of the
	     pane they open (WorkspaceChrome / PreviewPane), where the control sits on the boundary it
	     moves - so this row is only about the document -->
	<div class="flex min-w-0 items-center gap-2">
		{#if !loadedPath}
			<FileText class="text-faint size-4 shrink-0" />
			<span class="truncate text-sm font-medium">{m.wsview_no_file()}</span>
		{/if}
		{#if loadedPath && (kind === 'tex' || kind === 'md' || kind === 'typ') && (viewMode === 'visual' || viewMode === 'source')}
			<span class="shrink-0"><WordCount /></span>
		{/if}
	</div>
	<div class="flex items-center gap-2">
		{#if commentCount > 0}
			<!-- unresolved review threads, project-wide. Leftmost of the cluster on purpose: the row is
			     right-aligned, so out here the badge's appearance grows into free space instead of
			     nudging the view toggle - and comments are a document concern, so they sit with the
			     view controls, away from the compile zone (Problems stays glued to Compile as its
			     readout). Hidden at zero, like Problems after a clean compile - the badge appearing IS
			     the notification. -->
			<!-- outlined, not tonal: a filled gray chip reads as a disabled button, but a bare ghost
			     floats shapeless in the bar. Border, radius, padding and type size all mirror the
			     view toggle beside it, so the two read as one family of document controls. -->
			<button
				class="border-surface-300-700 hover:preset-tonal flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs"
				onclick={onShowComments}
				use:tip={m.wsview_show_comments_title()}
			>
				<MessageSquare class="size-3.5" />
				{commentCount}
			</button>
		{/if}
		{#if onSyncToCursor}
			<!-- only while the preview is popped out: its window has no divider chip, and the jump
			     reads the caret in THIS window. With the docked divider gone it joins the quiet
			     document-side controls before the view toggle, not the compile zone. -->
			<!-- same chip recipe as the comments badge and view toggle; quiet at rest, primary blue
			     on hover - the divider chip's gray-until-hover behavior from the docked state -->
			<button
				class="border-surface-300-700 hover:preset-filled-primary-500 hover:border-primary-500 flex items-center rounded-md border px-2.5 py-1 text-xs"
				onmousedown={(e) => e.preventDefault()}
				onclick={onSyncToCursor}
				use:tip={syncTargetsPreview ? m.wsview_sync_to_preview_title() : m.wsview_sync_to_pdf_title()}
				aria-label={syncTargetsPreview ? m.wsview_sync_to_preview_aria() : m.wsview_sync_to_pdf_aria()}
			>
				<!-- icon-only: the 1lh wrapper stands in for exactly one text-xs line box - the thing
				     that gives the neighboring chips their content height (18px in this theme, not
				     the 16px the Tailwind default would suggest) - while the glyph stays at their 14px -->
				<span class="flex h-[1lh] items-center"><ArrowRight class="size-3.5" /></span>
			</button>
		{/if}
		{#if loadedPath && (kind === 'tex' || kind === 'md' || kind === 'typ' || (kind === 'bib' && !guest))}
			<!-- visual/source toggle; for .bib it's the reference editor vs raw BibTeX (BibManager
			     stays host-only: it isn't wired to the shared doc yet) -->
			<div class="border-surface-300-700 inline-flex shrink-0 overflow-hidden rounded-md border text-xs">
				<button
					class="flex items-center gap-1 px-2.5 py-1 disabled:cursor-not-allowed disabled:opacity-40 {viewMode === 'visual'
						? 'preset-filled-primary-500'
						: 'hover:preset-tonal disabled:hover:bg-transparent'}"
					onclick={() => onSetViewMode('visual')}
					disabled={!!encodingIssue}
					use:tip={encodingIssue ?? m.wsview_visual_editor_title()}
				>
					<Eye class="size-3.5" />
					{m.wsview_visual_label()}
				</button>
				<button
					class="flex items-center gap-1 px-2.5 py-1 {viewMode === 'source' ? 'preset-filled-primary-500' : 'hover:preset-tonal'}"
					onclick={() => onSetViewMode('source')}
					use:tip={kind === 'typ' ? m.wsview_typst_source_title() : m.wsview_latex_source_title()}
				>
					<Code class="size-3.5" />
					{m.wsview_source_label()}
				</button>
			</div>
		{/if}
		{#if compileLog.current && (compileLog.current.errors.length > 0 || compileLog.current.warnings.length > 0)}
			<button
				class="btn btn-xs gap-1 {compileLog.current.errors.length > 0 ? 'preset-tonal-error' : 'preset-tonal-warning'}"
				onclick={onShowProblems}
				use:tip={m.wsview_show_problems_title()}
			>
				{#if compileLog.current.errors.length > 0}
					<CircleAlert class="size-3.5" /> {compileLog.current.errors.length}
				{/if}
				{#if compileLog.current.warnings.length > 0}
					<TriangleAlert class="size-3.5" /> {compileLog.current.warnings.length}
				{/if}
			</button>
		{/if}
		{#if fileMode.current}
			<button class="btn btn-xs {COMPILE_TONE.primary}" onclick={() => loadedPath && void openWorkspaceForFile(loadedPath)}>
				<FolderOpen class="size-4" />
				{m.wsview_open_in_workspace()}
			</button>
		{:else if terminalAvailable}
			<!-- the one-shot sync-to-cursor button used to sit here; it lives on the preview pane's
			     own header now (PreviewPane / TypstPreview) - and returns beside Compile while the
			     preview is popped out (see onSyncToCursor above) -->
			<div class="relative flex items-center">
				<CompileButton {...compile} />
				<!-- border-l-0: the button's right edge already draws the seam, and two hairlines
				     meeting there would read as a heavier line than the outline itself -->
				<button
					class="btn btn-xs {COMPILE_TONE[compile.tone]} rounded-l-none self-stretch border-l-0 px-1"
					onclick={() => (compileMenuOpen = !compileMenuOpen)}
					use:tip={m.wsview_compile_options()}
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
							class="hover:preset-tonal flex w-full items-center gap-2 rounded-base px-2 py-1.5 text-left text-sm whitespace-nowrap"
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
		{/if}
		{#if guest}
			<!-- guest: ask the host to compile (its toolchain), in the same spot and style as the
			     host's Compile so the bar reads the same on both sides. Hidden while the host
			     streams a live Typst preview: the stream already follows every keystroke, so a
			     compile request has nothing to produce (the host's Compile only re-opens its
			     preview pane there). .typ shows it too - a Typst project compiled by shell (the
			     Preview switch off) pushes its PDF exactly as a LaTeX one does. -->
			{#if loadedPath && (kind === 'tex' || kind === 'typ') && !guestTypstOffered}
				<button class="btn btn-xs preset-tonal-primary gap-1.5" onclick={onRequestCompile} use:tip={m.session_request_compile()}>
					<Play class="size-4" />
					{m.session_request_compile()}
				</button>
			{/if}
		{/if}
		{#if !guest}
			<!-- guests have nothing to save: their edits sync live through the shared doc -->
			<button class="btn btn-xs preset-filled-primary-500 gap-1.5" onclick={onSave} disabled={!loadedPath || saving || !isDirty.current}>
				{#if saving}<Loader2 class="size-4 animate-spin" />{:else}<Save class="size-4" />{/if}
				{m.wsview_save_label()}
			</button>
		{/if}
	</div>
</header>
