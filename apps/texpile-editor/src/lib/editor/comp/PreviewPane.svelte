<script lang="ts">
	// The right-hand preview pane (+ its drag splitter): the guest's pushed PDF, the live draft
	// renderer, or the compiled PDF. Renders two grid siblings, so it must sit in a display:contents
	// wrapper on the editor grid.
	import { X } from '@lucide/svelte';
	import PDFViewer from './PDFViewer.svelte';
	import DraftView from '$lib/draft/DraftView.svelte';
	import { settings } from '$lib/settings';
	import { m } from '$lib/paraglide/messages';

	interface Props {
		width: number;
		dockShrunk: boolean;
		guest: boolean;
		guestPdf: ArrayBuffer | null;
		pdfFilename: string;
		draftRoot: string;
		draftMainRel: string;
		draftTrigger: number;
		pdfPaneRef?: { scrollToPosition: (page: number, x: number, y: number, w?: number, h?: number) => void };
		draftRef?: DraftView | null;
		onStartResize: (e: MouseEvent) => void;
		onResizeByKey: (e: KeyboardEvent) => void;
		onClose: () => void;
		onPageClick: (page: number, x: number, y: number, selectText?: string) => void;
		onInverseSync: (file: string, line: number, selectText?: string) => void;
		onSettled: () => void;
	}
	let {
		width,
		dockShrunk,
		guest,
		guestPdf,
		pdfFilename,
		draftRoot,
		draftMainRel,
		draftTrigger,
		pdfPaneRef = $bindable(),
		draftRef = $bindable(),
		onStartResize,
		onResizeByKey,
		onClose,
		onPageClick,
		onInverseSync,
		onSettled
	}: Props = $props();
</script>

<!-- the WAI-ARIA window-splitter pattern (role=separator + tabindex); svelte's a11y rule doesn't special-case it -->
<!-- eslint-disable-next-line svelte/valid-compile -->
<div
	class="hover:bg-primary-500/40 active:bg-primary-500/60 w-1 shrink-0 cursor-col-resize bg-transparent transition-colors"
	style="grid-column: 2; grid-row: {dockShrunk ? '2 / -1' : '2'}"
	onmousedown={onStartResize}
	onkeydown={onResizeByKey}
	role="separator"
	aria-orientation="vertical"
	aria-label={m.wsview_resize_pdf_preview_aria()}
	tabindex="0"
></div>
<aside
	class="border-surface-200-800 flex shrink-0 flex-col border-l"
	style="width: {width}px; grid-column: 3; grid-row: {dockShrunk ? '2 / -1' : '2'}"
>
	<div class="bg-surface-100-900 text-surface-600-300 flex h-8 shrink-0 items-center justify-between border-b px-3 text-xs">
		<span class="font-medium">{!guest && $settings.draftMode ? m.wsview_live_preview_label() : m.wsview_pdf_preview_label()}</span>
		<button
			class="hover:preset-tonal rounded p-0.5"
			onclick={onClose}
			title={m.wsview_close_preview()}
			aria-label={m.wsview_close_preview()}
		>
			<X class="size-3.5" />
		</button>
	</div>
	<div class="min-h-0 flex-1">
		{#if guest}
			<!-- the host pushes its compiled PDF over the session; no local compile/synctex -->
			{#if guestPdf}
				<PDFViewer bind:this={pdfPaneRef} src={guestPdf} filename={m.wsview_pdf_preview_label()} {onPageClick} />
			{:else}
				<div class="text-surface-500 flex h-full items-center justify-center p-6 text-center text-sm">
					{m.session_pdf_waiting()}
				</div>
			{/if}
		{:else if $settings.draftMode}
			<DraftView bind:this={draftRef} root={draftRoot} mainFile={draftMainRel} trigger={draftTrigger} {onInverseSync} {onSettled} />
		{:else}
			<PDFViewer bind:this={pdfPaneRef} filename={pdfFilename} {onPageClick} />
		{/if}
	</div>
</aside>
