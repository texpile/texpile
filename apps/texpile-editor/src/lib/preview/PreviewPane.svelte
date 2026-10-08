<script lang="ts">
	// The right-hand preview pane (+ its drag splitter): the pane CHROME - splitter, divider chips,
	// the aside on the workspace grid. What shows inside is PreviewBody's five-way cascade, shared
	// with the popped-out preview window (PreviewPopout), which is why none of it lives here.
	// Renders two grid siblings, so it must sit in a display:contents wrapper on the editor grid.
	import { ArrowRight, ChevronRight } from '@lucide/svelte';
	import { slide } from 'svelte/transition';
	import PaneHandle from '$lib/components/PaneHandle.svelte';
	import PaneSplitter from '$lib/components/PaneSplitter.svelte';
	import PreviewBody from './PreviewBody.svelte';
	import { editorGroups } from '$lib/workspace/groups/editorGroups.svelte';
	import type { DraftController } from '$lib/draft/draftController.svelte';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		width: number;
		dockShrunk: boolean;
		guest: boolean;
		guestPdf: ArrayBuffer | null;
		/** the host streams its live Typst preview; show that instead of the pushed PDF */
		guestTypstOffered: boolean;
		/** no main file in a folder that has candidates: every body this pane could show (either
		 *  live preview, or the compiled PDF) would be stale or wrong, so it shows the picker */
		mainUnset: boolean;
		/** open the set-main-file prompt */
		onPickMain: () => void;
		pdfFilename: string;
		draft: DraftController;
		/** `host:port` of a running Typst preview, or null while one is still starting */
		typstPreviewHost: string | null;
		/**
		 * A Typst preview is what this pane is FOR, even before it has an address.
		 *
		 * Kept separate from the host so the pane never briefly shows the compiled PDF while the
		 * preview is being prepared - that flash is jarring and looks like a bug.
		 */
		typstPreviewWanted: boolean;
		/** one-shot jump of the preview to the editor caret; null hides the floating sync button */
		onSyncToCursor?: (() => void) | null;
		/** move the preview into its own OS window; undefined hides the chip */
		onPopout?: (() => void) | null;
		/** a splitter is being dragged; the frame holds its size rather than reflowing every frame */
		paneDragging: boolean;
		pdfPaneRef?: { scrollToPosition: (page: number, x: number, y: number, w?: number, h?: number, view?: number) => void };
		onStartResize: (e: MouseEvent) => void;
		onResizeByKey: (e: KeyboardEvent) => void;
		onClose: () => void;
		onPageClick: (page: number, x: number, y: number, selectText?: string) => void;
		onInverseSync: (file: string, line: number, selectText?: string) => void;
		onSettled: () => void;
		/** the finished compile's log path, for the Problems panel */
		onDiagnostics: (logPath: string) => void;
		/** it opens or shuts on its own, not at a click (PaneLayout.pdfSlides), so it slides to be seen */
		slides?: boolean;
	};
	let {
		width,
		dockShrunk,
		guest,
		guestPdf,
		guestTypstOffered,
		mainUnset,
		onPickMain,
		pdfFilename,
		draft,
		typstPreviewHost,
		typstPreviewWanted,
		onSyncToCursor = null,
		onPopout = null,
		paneDragging,
		// eslint-disable-next-line no-useless-assignment -- argless $bindable() marks the prop bindable; there is no value to read
		pdfPaneRef = $bindable(),
		onStartResize,
		onResizeByKey,
		onClose,
		onPageClick,
		onInverseSync,
		onSettled,
		onDiagnostics,
		slides = false
	}: Props = $props();
</script>

<PaneSplitter
	resizable
	resizeLabel={m.wsview_resize_pdf_preview_aria()}
	{onStartResize}
	{onResizeByKey}
	toggle={{ icon: ChevronRight, onclick: onClose, title: m.wsview_toggle_pdf_preview(), ariaLabel: m.wsview_toggle_pdf_preview() }}
	class="z-30"
	style="grid-column: 2; grid-row: {dockShrunk ? '2 / -1' : '2'}"
/>
<!-- no border-l: the splitter's own 1px IS the rule now, and a border beside it read as two -->
<aside
	class="relative flex shrink-0 flex-col"
	style="width: {width}px; grid-column: 3; grid-row: {dockShrunk ? '2 / -1' : '2'}"
	transition:slide|global={{ axis: 'x', duration: slides ? 200 : 0 }}
>
	{#if onSyncToCursor && !mainUnset}
		<!-- forward sync rides the same divider, high and clear of the collapse lozenge. -12.5px
		     centres a 24px chip on the rule, matching the lozenge below it. This one is wider than
		     the 3px the panes hold clear, so it does cross the scrollbar - it is also the one you
		     press once and forget, rather than something parked on the line.

		     112px down, not Overleaf's own 68px: their toolbars are not ours. Here the editor's tab
		     strip (h-9) and format toolbar (min-h-10) put a horizontal rule at 76px, and a chip at
		     68 spans 68-92 - so that rule ran straight through it. 112px clears the toolbar
		     entirely, which is where this sat before and why. Round rather than a
		     lozenge because it acts on the document, not on the boundary. The reverse direction
		     needs no button: a click in the preview is the inverse jump.

		     Editors stacked in two rows give each row its own, shown while an editor in that row has focus -->
		{#each editorGroups.rowTops as top, row (row)}
			<PaneHandle
				icon={ArrowRight}
				class="-left-[12.5px] duration-300"
				style="top: {top + 112}px"
				hidden={row !== editorGroups.focusedRow}
				onclick={onSyncToCursor}
				title={(guest ? guestTypstOffered : typstPreviewWanted) ? m.wsview_sync_to_preview_title() : m.wsview_sync_to_pdf_title()}
				ariaLabel={(guest ? guestTypstOffered : typstPreviewWanted) ? m.wsview_sync_to_preview_aria() : m.wsview_sync_to_pdf_aria()}
			/>
		{/each}
	{/if}
	<PreviewBody
		docked
		{guest}
		{guestPdf}
		{guestTypstOffered}
		{mainUnset}
		{onPickMain}
		{pdfFilename}
		{draft}
		{typstPreviewHost}
		{typstPreviewWanted}
		{paneDragging}
		{onPopout}
		onPdfRef={(r) => (pdfPaneRef = r)}
		{onPageClick}
		{onInverseSync}
		{onSettled}
		{onDiagnostics}
	/>
</aside>
