<script lang="ts">
	// The preview pane's BODY: the header strip and the five-way cascade (guest streamed Typst
	// preview, guest pushed PDF, local Typst preview, live draft, compiled PDF). Extracted from
	// PreviewPane so the same component can render docked in the workspace grid or portalled into
	// the popped-out preview window (PreviewPopout) - the pane chrome (splitter, divider chips)
	// stays with the docked pane, which is the only place it means anything.
	import { tip } from '$lib/components/tooltip.svelte';
	import { PictureInPicture2 } from '@lucide/svelte';
	import PDFViewer from './PDFViewer.svelte';
	import type DraftView from '$lib/draft/DraftView.svelte';
	import type { DraftController } from '$lib/draft/draftController.svelte';
	import type TypstPreview from '$lib/languages/typst/preview/TypstPreview.svelte';
	import type TypstPreviewRemote from '$lib/languages/typst/preview/TypstPreviewRemote.svelte';
	import { compileConfig } from '$lib/workspace/projectConfigSync.svelte';
	import { m } from '$lib/paraglide/messages';

	// DraftView drags in opentype.js; draft mode is opt-in, so it loads only when first shown
	let DraftViewComp = $state<typeof DraftView | null>(null);
	$effect(() => {
		if (!guest && compileConfig.current.latex.liveMode && !DraftViewComp) {
			import('$lib/draft/DraftView.svelte').then(
				(mod) => (DraftViewComp = mod.default),
				(e) => console.error('Failed to load draft view chunk:', e)
			);
		}
	});

	// The Typst preview carries a ~1.2MB wasm renderer; a LaTeX project must never pay for it, so
	// the chunk is fetched only once a preview has actually been started.
	let TypstPreviewComp = $state<typeof TypstPreview | null>(null);
	$effect(() => {
		if (typstPreviewWanted && !TypstPreviewComp) {
			import('$lib/languages/typst/preview/TypstPreview.svelte').then(
				(mod) => (TypstPreviewComp = mod.default),
				(e) => console.error('Failed to load Typst preview chunk:', e)
			);
		}
	});

	// the guest counterpart: the host's preview streamed over the session, loaded just as lazily
	let TypstPreviewRemoteComp = $state<typeof TypstPreviewRemote | null>(null);
	$effect(() => {
		if (guest && guestTypstOffered && !TypstPreviewRemoteComp) {
			import('$lib/languages/typst/preview/TypstPreviewRemote.svelte').then(
				(mod) => (TypstPreviewRemoteComp = mod.default),
				(e) => console.error('Failed to load remote Typst preview chunk:', e)
			);
		}
	});

	type Props = {
		guest: boolean;
		guestPdf: ArrayBuffer | null;
		/** the host streams its live Typst preview; show that instead of the pushed PDF */
		guestTypstOffered: boolean;
		/** no main file in a folder that has candidates: the pane shows the picker */
		mainUnset: boolean;
		/** open the set-main-file prompt */
		onPickMain: () => void;
		pdfFilename: string;
		draft: DraftController;
		/** `host:port` of a running Typst preview, or null while one is still starting */
		typstPreviewHost: string | null;
		/** a Typst preview is what this pane is FOR, even before it has an address */
		typstPreviewWanted: boolean;
		/** compile the previewed document to a PDF on disk (the preview itself never writes one) */
		onSaveTypstPdf: () => Promise<void>;
		/** a splitter is being dragged; the frame holds its size rather than reflowing every frame */
		paneDragging: boolean;
		/** move the preview into its own OS window; null (the popped-out body) hides the button */
		onPopout?: (() => void) | null;
		/**
		 * Callback refs rather than bindables: the popout mounts this component imperatively
		 * (svelte's mount()), where bind: does not exist. The docked pane adapts them back onto its
		 * own bindable props.
		 */
		onPdfRef?: (ref: { scrollToPosition: (page: number, x: number, y: number, w?: number, h?: number) => void } | undefined) => void;
		onPageClick: (page: number, x: number, y: number, selectText?: string) => void;
		onInverseSync: (file: string, line: number, selectText?: string) => void;
		onSettled: () => void;
		/** the finished compile's log path, for the Problems panel */
		onDiagnostics: (logPath: string) => void;
	};
	let {
		guest,
		guestPdf,
		guestTypstOffered,
		mainUnset,
		onPickMain,
		pdfFilename,
		draft,
		typstPreviewHost,
		typstPreviewWanted,
		onSaveTypstPdf,
		paneDragging,
		onPopout = null,
		onPdfRef,
		onPageClick,
		onInverseSync,
		onSettled,
		onDiagnostics
	}: Props = $props();

	// both PDF lanes (guest pushed, local compiled) are the same viewer; whichever is mounted
	// is the one sync results scroll
	let pdfViewer = $state<{ scrollToPosition: (page: number, x: number, y: number, w?: number, h?: number) => void } | undefined>();
	$effect(() => {
		onPdfRef?.(pdfViewer);
		return () => onPdfRef?.(undefined);
	});
	// the controller patches through this instance; registered here, where it mounts
	let draftView = $state<DraftView | null>(null);
	$effect(() => {
		draft.view = draftView;
		return () => {
			draft.view = null;
		};
	});
</script>

<div class="relative flex h-full w-full flex-col">
	{#if !(typstPreviewWanted && !guest) && !(guest && guestTypstOffered)}
		<!-- h-9 matches the editor column's tab strip, so the two header borders draw one line -->
		<div
			class="bg-surface-100-900 text-surface-600-300 border-surface-200-800 flex h-9 shrink-0 items-center justify-between border-b px-3 text-xs"
		>
			<span class="font-medium">
				{#if !guest && compileConfig.current.latex.liveMode}
					{m.wsview_live_preview_label()}
				{:else}
					{m.wsview_pdf_preview_label()}
				{/if}
			</span>
			<!-- no close button: docked, the divider's lozenge is the close (the control on the
			     boundary it moves); popped out, the OS window's own close is right above -->
			<div class="flex items-center gap-1">
				{#if onPopout}
					<button
						class="hover:preset-tonal rounded-base p-1"
						onclick={onPopout}
						use:tip={m.wsview_popout_preview()}
						aria-label={m.wsview_popout_preview()}
					>
						<PictureInPicture2 class="size-4" />
					</button>
				{/if}
			</div>
		</div>
	{/if}
	<div class="min-h-0 flex-1">
		{#if guest}
			<!-- a streamed Typst preview outranks the pushed PDF for the same reason the local
			     preview outranks the compiled file: same document, and it is ahead of it -->
			{#if guestTypstOffered}
				{#if TypstPreviewRemoteComp}
					<TypstPreviewRemoteComp {paneDragging} {onPopout} />
				{/if}
			{:else if guestPdf}
				<!-- the host pushes its compiled PDF over the session; no local compile/synctex -->
				<PDFViewer bind:this={pdfViewer} src={guestPdf} filename={m.wsview_pdf_preview_label()} {onPageClick} />
			{:else}
				<div class="text-surface-500 flex h-full items-center justify-center p-6 text-center text-sm">
					{m.session_pdf_waiting()}
				</div>
			{/if}
		{:else if mainUnset}
			<!-- No main file: EVERY body this pane could show is wrong - the Typst preview and the
			     draft engine have no document (both are pinned to the main), and the PDF viewer
			     would show whatever the last main compiled, which the user just walked away from.
			     One message for all four lanes, carrying the fix. -->
			<div class="flex h-full items-center justify-center p-6">
				<div class="max-w-sm text-center">
					<p class="text-surface-500 text-sm">{m.wsview_pane_no_main()}</p>
					<button class="btn btn-sm preset-tonal-primary mt-3" onclick={onPickMain}>
						{m.wsview_pane_pick_main()}
					</button>
				</div>
			</div>
		{:else if typstPreviewWanted}
			<!-- tinymist's document stream, rendered in-pane. Takes precedence over the compiled PDF:
			     it is the same document and it is ahead of it, since it needs no save. Rendered on
			     `wanted` rather than on the host so the PDF never flashes up while it starts. -->
			{#if TypstPreviewComp}
				<TypstPreviewComp host={typstPreviewHost} {paneDragging} {onSaveTypstPdf} {onPopout} />
			{/if}
		{:else if compileConfig.current.latex.liveMode}
			{#if DraftViewComp}
				<DraftViewComp
					bind:this={draftView}
					root={draft.root}
					mainFile={draft.mainRel}
					trigger={draft.trigger}
					quietTrigger={draft.quietTrigger}
					{onInverseSync}
					{onSettled}
					{onDiagnostics}
				/>
			{/if}
		{:else}
			<PDFViewer bind:this={pdfViewer} filename={pdfFilename} {onPageClick} />
		{/if}
	</div>
</div>
