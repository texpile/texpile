<script lang="ts">
	// The project's controls, on the preview's bar or in the title bar without one: suggest mode, comments, Problems
	// and the compile / preview controls. Each editor's own sit on its tab strip (EditorStripControls).
	import { tip } from '$lib/components/tooltip.svelte';
	import { openWorkspaceForFile } from '$lib/workspace/openWorkspace';
	import { fileMode } from '$lib/workspace/fileMode.svelte';
	import { latexLiveMode } from '$lib/workspace/projectConfigSync.svelte';
	import { compileLog } from '$lib/stores/compileLogStore';
	import CompileButton, { COMPILE_TONE } from '$lib/preview/CompileButton.svelte';
	import CompileOptionsMenu from './CompileOptionsMenu.svelte';
	import type { ComponentProps } from 'svelte';
	import { m } from '$lib/paraglide/messages';
	import { combo } from '$lib/chrome/shortcutText';
	import type { FileKind } from '$lib/workspace/documentBuffer.svelte';
	import EditModePicker from './EditModePicker.svelte';
	import {
		ArrowRight,
		Square,
		Play,
		ChevronDown,
		CircleAlert,
		TriangleAlert,
		ShieldQuestion,
		MessageSquare,
		FolderOpen,
		PanelRight
	} from '@lucide/svelte';

	type Props = {
		loadedPath: string | null;
		kind: FileKind;
		guest: boolean;
		terminalAvailable: boolean;
		compiling: boolean;
		/** the preview pane is (or is about to be) a Typst live preview; see WorkspaceView */
		typstPreviewWanted: boolean;
		/** guest only: the host streams its live Typst preview, so there is no compile to request */
		guestTypstOffered?: boolean;
		pdfPaneOpen: boolean;
		draftPaused: boolean;
		onStopCompile: () => void;
		onPauseDraft: () => void;
		onResumeDraft: () => void;
		onCompile: () => void;
		/** the project asks for an unaccepted compile command; the slot shows blocked (see runCompile) */
		commandPending?: boolean;
		/** guest only: ask the host to compile (it owns the toolchain). */
		onRequestCompile: () => void;
		onConfigureCompile: () => void;
		onCompileFromScratch: () => void;
		onCleanAux: () => void;
		/** latexmk only, and only while Compile runs the shell command (CompilePipeline decides) */
		latexmkActionsAvailable?: boolean;
		onShowOutput: () => void;
		outputAvailable?: boolean;
		onShowProblems: () => void;
		/** open review threads in the project; 0 hides the badge, like a clean compile hides Problems */
		commentCount?: number;
		onShowComments?: () => void;
		suggesting?: boolean;
		onToggleSuggest?: (suggesting: boolean) => void;
		onTogglePdf: () => void;
		/**
		 * One-shot sync of the preview to the caret, shown ONLY while the preview is popped out
		 * into its own window: docked, the chip on the pane divider is that button, and it leaves
		 * with the pane. Null hides it.
		 */
		onSyncToCursor?: (() => void) | null;
		/** flavors the sync button's tooltip: live preview wording vs SyncTeX wording */
		syncTargetsPreview?: boolean;
		/** in the title bar: icons at the bar's height, no boxes round the counters */
		compact?: boolean;
	};
	let {
		loadedPath,
		kind,
		guest,
		terminalAvailable,
		compiling,
		typstPreviewWanted,
		guestTypstOffered = false,
		pdfPaneOpen,
		draftPaused,
		onStopCompile,
		onPauseDraft,
		onResumeDraft,
		onCompile,
		commandPending = false,
		onRequestCompile,
		onConfigureCompile,
		onCompileFromScratch,
		onCleanAux,
		latexmkActionsAvailable = false,
		onShowOutput,
		outputAvailable = false,
		onShowProblems,
		commentCount = 0,
		onShowComments = () => {},
		suggesting = false,
		onToggleSuggest,
		onTogglePdf,
		onSyncToCursor = null,
		syncTargetsPreview = false,
		compact = false
	}: Props = $props();
	const quiet = $derived(
		compact
			? 'btn btn-xs h-[22px] px-1.5 hover:preset-tonal'
			: 'btn btn-xs preset-outlined-surface-200-800 bg-surface-50-950 hover:preset-tonal'
	);
	const solid = $derived(compact ? 'h-[22px] px-1.5' : '');
	// with the preview closed, Compile's one job is showing the PDF, so the title bar names that instead
	const showPdf = $derived(compact && !pdfPaneOpen && !fileMode.current);

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
				title: m.wsview_stop_compile_title({ combo: combo('Enter', { alt: true }) }),
				onclick: onStopCompile
			};
		// the preview is attached; closing the pane is its stop (the pane detaches the server task
		// on close), so this is both indicator and off switch
		if (typstLive && pdfPaneOpen)
			return { tone: 'success', dot: true, label: m.wsview_live_label(), title: m.wsview_typst_preview_live_title(), onclick: onTogglePdf };
		if (latexLiveMode() && pdfPaneOpen) {
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
		const live = typstLive || latexLiveMode();
		return {
			tone: 'primary',
			icon: Play,
			label: live ? m.wsview_preview_label() : m.wsview_compile_label(),
			title: live ? m.wsview_open_live_preview_title() : m.wsview_compile_title({ combo: combo('Enter', { alt: true }) }),
			onclick: onCompile
		};
	});
</script>

<div class="flex items-center gap-2 @max-[20rem]:gap-0.5">
	<div class="flex items-center gap-2 @max-[20rem]:gap-0.5">
		<!-- Compile first: the end of the bar nearest the editor -->
		{#if fileMode.current}
			<button
				class="btn btn-xs {COMPILE_TONE.primary} {solid}"
				onclick={() => loadedPath && void openWorkspaceForFile(loadedPath)}
				use:tip={compact ? m.wsview_open_in_workspace() : undefined}
				aria-label={m.wsview_open_in_workspace()}
			>
				<FolderOpen class={compact ? 'size-3.5' : 'size-4'} />
				{#if !compact}<span class="cap-center">{m.wsview_open_in_workspace()}</span>{/if}
			</button>
		{:else if terminalAvailable && !showPdf}
			<div class="relative flex items-center">
				<CompileButton {...compile} {compact} />
				<!-- border-l-0: the button's right edge already draws the seam, and two hairlines
				     meeting there would read as a heavier line than the outline itself -->
				<button
					class="btn btn-xs {COMPILE_TONE[compile.tone]} self-stretch rounded-l-none border-l-0 {compact ? 'px-0.5' : 'px-1'}"
					onclick={() => (compileMenuOpen = !compileMenuOpen)}
					use:tip={m.wsview_compile_options()}
					aria-label={m.wsview_compile_options()}
					aria-haspopup="menu"
					aria-expanded={compileMenuOpen}
				>
					<ChevronDown class="{compact ? 'size-3' : 'size-3.5'} transition-transform {compileMenuOpen ? 'rotate-180' : ''}" />
				</button>
				<CompileOptionsMenu
					open={compileMenuOpen}
					onClose={() => (compileMenuOpen = false)}
					onConfigure={onConfigureCompile}
					onFromScratch={onCompileFromScratch}
					{onCleanAux}
					latexmkActions={latexmkActionsAvailable}
					{onShowOutput}
					{outputAvailable}
				/>
			</div>
		{/if}
		{#if guest && !showPdf}
			<!-- guest: ask the host to compile (its toolchain), in the same spot and style as the
			     host's Compile so the bar reads the same on both sides. Hidden while the host
			     streams a live Typst preview: the stream already follows every keystroke, so a
			     compile request has nothing to produce (the host's Compile only re-opens its
			     preview pane there). .typ shows it too - a Typst project compiled by shell (the
			     Preview switch off) pushes its PDF exactly as a LaTeX one does. -->
			{#if loadedPath && (kind === 'tex' || kind === 'typ') && !guestTypstOffered}
				<button
					class="btn btn-xs preset-tonal-primary {solid} gap-1.5"
					onclick={onRequestCompile}
					use:tip={m.session_request_compile()}
					aria-label={m.session_request_compile()}
				>
					<Play class={compact ? 'size-3.5' : 'size-4'} />
					{#if !compact}<span class="cap-center">{m.session_request_compile()}</span>{/if}
				</button>
			{/if}
		{/if}
		{#if compileLog.current && (compileLog.current.errors.length > 0 || compileLog.current.warnings.length > 0)}
			<button
				class="{quiet} gap-1 {compileLog.current.errors.length > 0 ? 'text-error-ink' : 'text-warning-ink'}"
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
		{#if onSyncToCursor}
			<!-- only while the preview is popped out: its window has no divider chip, and the jump reads the caret in this window -->
			<button
				class={quiet}
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
		{#if commentCount > 0}
			<!-- unresolved review threads, project-wide; hidden at zero, like Problems after a clean compile -->
			<button class="{quiet} gap-1" onclick={onShowComments} use:tip={m.wsview_show_comments_title()}>
				<MessageSquare class="size-3.5" />
				{commentCount}
			</button>
		{/if}
		{#if onToggleSuggest}
			<EditModePicker {suggesting} onChange={onToggleSuggest} {compact} />
		{:else if fileMode.current}
			<EditModePicker suggesting={false} onChange={() => {}} unavailable={m.single_file_unavailable()} {compact} />
		{/if}
		{#if showPdf}
			<!-- unboxed like Layout beside it: a border made it the heaviest thing in the title bar -->
			<button class="hover:bg-surface-200-800 rounded-base flex h-[22px] items-center gap-1 px-1.5 text-xs" onclick={onTogglePdf}>
				<PanelRight class="size-3.5" />
				<span class="cap-center">{m.wsview_show_pdf()}</span>
			</button>
		{/if}
	</div>
</div>
