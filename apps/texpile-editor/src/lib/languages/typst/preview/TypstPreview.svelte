<script lang="ts">
	// tinymist's preview, framed.
	//
	// The document is rendered by tinymist's own viewer page - incremental SVG patching, ctrl+wheel
	// zoom, its keybindings, click-to-jump - which we fetch, theme and re-serve on loopback (see
	// electron/src/typstPreviewPage.ts). This component is the frame around it.
	//
	// The frame is a SEPARATE ORIGIN, so the page cannot reach this window's bridges. The only
	// channel between us is postMessage, and the bridge on the far side is one we injected. That is
	// what lets the zoom control below drive a viewer we cannot otherwise touch.
	import { tip } from '$lib/components/tooltip.svelte';
	import { ZoomIn, ZoomOut, Crosshair, FileDown, FileOutput, Loader2, PictureInPicture2 } from '@lucide/svelte';
	import PreviewToolbar, { type PreviewToolbarPlace } from '$lib/preview/PreviewToolbar.svelte';
	import ColorVisionMenu from '$lib/preview/colorVision/ColorVisionMenu.svelte';
	import ColorVisionFilter from '$lib/preview/colorVision/ColorVisionFilter.svelte';
	import { typstExport } from '../export/dialog/typstExportState.svelte';
	import { resolvedMode, themeEpoch } from '$lib/theme';
	import { settings, updateSettings } from '$lib/settings';
	import { followScrollTick, guestJumpFreezeTick } from './followSignal';
	import { themeColour } from './themeColour';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		/** `host:port` of the running preview server, or null while it is still starting */
		host: string | null;
		/** a splitter is being dragged; hold the frame's size instead of reflowing it every frame */
		paneDragging: boolean;
		/** compile the previewed document to a PDF on disk (the preview itself never writes one) */
		onSaveTypstPdf: () => Promise<void>;
		/** move the preview into its own OS window; null (already popped out) hides the button */
		onPopout?: (() => void) | null;
		/** docked in the pane, where this row stands in for a tab strip; false in the popped-out window */
		asTabStrip?: boolean;
	};
	let { host, paneDragging, onSaveTypstPdf, onPopout = null, asTabStrip = true }: Props = $props();

	/** an export is in flight; the button shows it and refuses a second one */
	let savingPdf = $state(false);
	async function saveAsPdf() {
		if (savingPdf) return;
		savingPdf = true;
		try {
			await onSaveTypstPdf();
		} finally {
			savingPdf = false;
		}
	}

	let frameBox = $state<HTMLDivElement | null>(null);
	/**
	 * The frame's width, frozen for the duration of a splitter drag.
	 *
	 * An iframe re-lays out its whole document on every width change, and this one re-renders a
	 * typeset document, so following the pointer costs a full reflow per frame. Holding the old
	 * width and taking the cost once on release is what keeps the drag smooth; the frame is blurred
	 * meanwhile so the stale size reads as deliberate rather than broken.
	 */
	let frozenWidth = $state<number | null>(null);
	$effect(() => {
		if (paneDragging) {
			if (frozenWidth === null && frameBox) frozenWidth = frameBox.clientWidth;
		} else {
			frozenWidth = null;
		}
	});

	const CHANNEL = 'texpile-preview';

	let frameUrl = $state<string | null>(null);
	let error = $state<string | null>(null);
	let zoom = $state<number | null>(null);
	let frame = $state<HTMLIFrameElement | null>(null);

	const dark = $derived(resolvedMode.current === 'dark');

	// The surround behind the pages, and it has to CONTRAST with them: the viewer draws white paper
	// and nothing else, so a near-white surround makes the page edges vanish and the document reads
	// as one endless sheet. surface-300 in light, surface-800 in dark - dark enough to separate the
	// pages, short of the near-black surface-950 the PDF pane uses, which reads as a hole.
	// tracked on the theme epoch too: the probe reads computed colours, which change once a chosen
	// theme's stylesheet has loaded, not when its name does
	const background = $derived.by(() => {
		void themeEpoch.current;
		return dark ? themeColour('--color-surface-800', '#27272a') : themeColour('--color-surface-300', '#d4d4d8');
	});
	const foreground = $derived.by(() => {
		void themeEpoch.current;
		return dark ? themeColour('--color-surface-200', '#e4e4e7') : themeColour('--color-surface-700', '#3f3f46');
	});

	$effect(() => {
		// tracked: the host, and the theme colours baked into the page at prepare time
		const h = host;
		if (!h) return;
		const bg = background;
		const fg = foreground;
		let cancelled = false;
		frameUrl = null;
		error = null;
		zoom = null;

		// Checked as a FUNCTION, not just for the bridge object. `?.` guards a missing bridge (the
		// browser dev server has none) but not a bridge missing this method, which is what a stale
		// electron/dist/preload.js looks like - and that threw inside the effect and took the pane
		// down with it. A preview we cannot start is an error to report, not a crash.
		const bridge = window.texpileTypst;
		if (typeof bridge?.preparePreview !== 'function') {
			error = m.typst_preview_unavailable();
			return;
		}

		bridge.preparePreview(h, bg, fg).then(
			(res) => {
				if (cancelled) return;
				if (res?.ok && res.url) frameUrl = res.url;
				else error = res?.error ?? m.typst_preview_failed();
			},
			(e) => {
				if (!cancelled) error = e instanceof Error ? e.message : String(e);
			}
		);

		return () => {
			cancelled = true;
			if (typeof bridge.releasePreview === 'function') bridge.releasePreview();
		};
	});

	/** what the framed page reports about itself; see the bridge in electron/src/typstPreviewPage.ts */
	type FrameStatus = {
		pages: number;
		/** WebSocket.readyState, or -1 when the page never constructed a socket at all */
		socket: number;
		socketUrl: string | null;
		/** set when the WebSocket constructor threw, which is how a mixed-content block presents */
		socketThrew: string | null;
		closeCode: number | null;
		closeReason: string | null;
		origin: string;
		secureContext: boolean;
		viewer: boolean;
		initialized: boolean;
		zoom: number | null;
	};
	let status = $state<FrameStatus | null>(null);

	// A framed page is a different origin with its own console, so a failure in there is invisible
	// from out here. The bridge reports back instead, and the pane says what is wrong rather than
	// sitting blank.
	$effect(() => {
		// listen where the frame lives: the page posts to ITS parent window, which is the popup's
		// rather than this module's global whenever the pane is in the popped-out preview window
		const win = frameBox?.ownerDocument.defaultView;
		if (!win) return;
		function onMessage(e: MessageEvent) {
			const d = e.data;
			if (!d || typeof d !== 'object' || d.channel !== CHANNEL) return;
			if (d.type === 'zoom' && typeof d.value === 'number') zoom = d.value;
			else if (d.type === 'status' && d.value) {
				status = d.value as FrameStatus;
				if (typeof status.zoom === 'number') zoom = status.zoom;
			} else if (d.type === 'error' && typeof d.value === 'string') error = d.value;
		}
		win.addEventListener('message', onMessage);
		return () => win.removeEventListener('message', onMessage);
	});

	/** null once it is rendering; otherwise the reason it is not. */
	const stall = $derived.by(() => {
		if (!frameUrl || error || !status || status.pages > 0) return null;
		if (!status.viewer) return m.typst_preview_stall_no_viewer();
		if (status.socket !== 1) return m.typst_preview_stall_no_socket();
		if (!status.initialized) return m.typst_preview_stall_no_document();
		return null;
	});

	// Everything is connected and still no document: that is what a failed compile looks like from
	// here (tinymist only pushes renders that succeeded), so the blank frame says where the errors
	// went instead of just sitting white.
	const noDocument = $derived(
		!!frameUrl && !error && !!status && status.pages === 0 && status.viewer && status.socket === 1 && !status.initialized
	);

	/** the raw numbers behind `stall`, for the tooltip - enough to tell the faults apart */
	const stallDetail = $derived(
		status
			? [
					`socket=${status.socket}`,
					`url=${status.socketUrl ?? 'none'}`,
					status.socketThrew ? `threw=${status.socketThrew}` : null,
					status.closeCode !== null ? `close=${status.closeCode}${status.closeReason ? ` (${status.closeReason})` : ''}` : null,
					`origin=${status.origin}`,
					`secure=${status.secureContext}`
				]
					.filter(Boolean)
					.join(' ')
			: ''
	);

	/** `dir` is +1 to zoom in, -1 out; the far side steps through tinymist's own zoom ladder. */
	function stepZoom(dir: 1 | -1): void {
		frame?.contentWindow?.postMessage({ channel: CHANNEL, type: 'zoom', value: dir }, '*');
	}

	// A follow scroll was just sent: tell the framed viewer to swallow the jump ripple it is
	// about to draw. Follow jumps are ambient - the "here is where you landed" circle belongs to
	// deliberate jumps (the sync button, Show in preview), whose sends do not bump this tick.
	// 500ms comfortably covers the LSP round trip and data-plane push that follow the tick.
	$effect(() => {
		if (followScrollTick.current === 0) return;
		frame?.contentWindow?.postMessage({ channel: CHANNEL, type: 'quiet', value: 500 }, '*');
	});

	// A guest's forward-sync is about to make tinymist broadcast a jump aimed at that guest; this
	// pane's direct socket would receive it too, so the bridge swallows jump/cursor frames briefly.
	$effect(() => {
		if (guestJumpFreezeTick.current === 0) return;
		frame?.contentWindow?.postMessage({ channel: CHANNEL, type: 'freeze', value: 1500 }, '*');
	});
</script>

<div class="bg-surface-200-800 flex h-full w-full flex-col">
	{#snippet status()}
		{#if error}
			<span class="text-error-ink truncate text-sm" use:tip={error}>{error}</span>
		{:else if stall && !noDocument}
			<!-- the no-document stall is NOT repeated here: the frame overlay below already says it -->
			<span class="text-warning-ink truncate text-sm" use:tip={`${stall}\n${stallDetail}`}>{stall}</span>
			<span class="text-muted truncate font-mono text-[10px]">{stallDetail}</span>
		{:else}
			<span class="truncate text-sm">{frameUrl ? m.typst_preview_live() : m.typst_preview_connecting()}</span>
		{/if}
	{/snippet}
	<!-- zoom is the only viewer control: tinymist's viewer ships no toolbar and its users scroll, so
	     zoom is the one thing with no keyboard-free equivalent -->
	{#snippet zoomGroup()}
		<button onclick={() => stepZoom(-1)} disabled={!frameUrl} use:tip={m.draft_toolbar_zoom_out()} aria-label={m.draft_toolbar_zoom_out()}>
			<ZoomOut size={16} />
		</button>
		<span class="preview-toolbar-readout">{zoom !== null ? `${zoom}%` : '—'}</span>
		<button onclick={() => stepZoom(1)} disabled={!frameUrl} use:tip={m.draft_toolbar_zoom_in()} aria-label={m.draft_toolbar_zoom_in()}>
			<ZoomIn size={16} />
		</button>
	{/snippet}
	<!-- follow-always lives here; its one-shot sibling rides the pane splitter (PreviewPane) -->
	{#snippet follow()}
		<button
			aria-pressed={settings.current.typstPreviewFollow === true}
			onclick={() => updateSettings({ typstPreviewFollow: settings.current.typstPreviewFollow !== true })}
			disabled={!frameUrl}
			use:tip={settings.current.typstPreviewFollow === true ? m.typst_preview_follow_on() : m.typst_preview_follow_off()}
			aria-label={m.typst_preview_follow_aria()}
		>
			<Crosshair size={16} />
		</button>
	{/snippet}
	<!-- the preview never writes a file; this is tinymist.exportPdf, the same command the VS Code
	     extension's Export PDF runs. Disabled until the preview is live: same server, same
	     document, so "previewable" and "exportable" are the same condition. -->
	{#snippet exportPdf()}
		<button
			onclick={saveAsPdf}
			disabled={!frameUrl || savingPdf}
			use:tip={m.typst_preview_save_pdf()}
			aria-label={m.typst_preview_save_pdf()}
		>
			{#if savingPdf}<Loader2 size={16} class="animate-spin" />{:else}<FileDown size={16} />{/if}
		</button>
		<!-- the other formats and the PDF options, through the same server -->
		<button
			onclick={() => typstExport.show()}
			disabled={!frameUrl || !typstExport.available}
			use:tip={m.typst_export_toolbar()}
			aria-label={m.typst_export_toolbar()}
		>
			<FileOutput size={16} />
		</button>
	{/snippet}
	{#snippet vision(place: PreviewToolbarPlace)}
		<ColorVisionMenu {place} />
	{/snippet}
	<!-- no close button: docked, the divider's lozenge closes the pane; popped out, the OS
	     window's own close does. The green Live button in the topbar is the third way off. -->
	{#snippet popout()}
		<button onclick={() => onPopout?.()} use:tip={m.wsview_popout_preview()} aria-label={m.wsview_popout_preview()}>
			<PictureInPicture2 size={16} />
		</button>
	{/snippet}
	<PreviewToolbar
		leading={status}
		trailing={onPopout ? popout : undefined}
		{asTabStrip}
		groups={[
			{ id: 'zoom', render: zoomGroup },
			{ id: 'follow', render: follow },
			{ id: 'vision', render: vision },
			{ id: 'export', render: exportPdf }
		]}
	/>

	<div bind:this={frameBox} class="relative min-h-0 flex-1 overflow-hidden">
		{#if frameUrl}
			<!-- sandboxed by origin, not by the sandbox attribute: the page needs scripts and its own
			     wasm, and its CSP (set where it is served) is what actually bounds it -->
			<ColorVisionFilter class="h-full">
				<iframe
					bind:this={frame}
					src={frameUrl}
					title={m.typst_preview_label()}
					class="h-full border-0 transition-[filter] duration-100"
					class:blur-[1.5px]={frozenWidth !== null}
					class:pointer-events-none={frozenWidth !== null}
					style:width={frozenWidth !== null ? `${frozenWidth}px` : '100%'}
					onerror={() => (error = m.typst_preview_frame_failed())}
				></iframe>
			</ColorVisionFilter>
			{#if noDocument}
				<!-- a card, not bare text: the surround behind it is mid-grey in both themes, so bare
				     muted text was barely legible on it -->
				<div class="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
					<div
						class="bg-surface-100-900 text-surface-700-200 border-surface-300-700 max-w-sm rounded-container border px-4 py-3 text-center text-sm shadow-sm"
					>
						{m.typst_preview_no_document_hint()}
					</div>
				</div>
			{/if}
		{:else if !error}
			<div class="text-muted flex h-full items-center justify-center text-center text-sm">
				{m.typst_preview_waiting()}
			</div>
		{/if}
	</div>
</div>
