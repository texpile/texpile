<script lang="ts">
	// Shows the engine's output on screen and splices instant patches into it.
	// Everything painted came from the real engine (page records, the exact PDF at rest,
	// daemon typesets while typing); a patch applies ONLY where the C1/C2/C3 predicates
	// prove a real recompile would produce the same page, else nothing is painted and the
	// full pass runs.
	// The locate ladder, overflow planning, and patch verification live in ./locate and
	// ./patch; the caches, painting, patch lifecycle, and compile lifecycle live in the
	// session pieces (draftSession and what it composes). This file is the view shell.
	import { tip } from '$lib/components/tooltip.svelte';
	import { untrack } from 'svelte';
	import { fade } from 'svelte/transition';
	import { ZoomIn, ZoomOut, MoveHorizontal, ChevronUp, ChevronDown, Crosshair, Download, PictureInPicture2 } from '@lucide/svelte';
	import PreviewToolbar from '$lib/preview/PreviewToolbar.svelte';
	import { DraftSession } from './draftSession.svelte';
	import type { PatchReq } from './patch/patch.types';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		root: string;
		mainFile: string;
		/** bump to trigger a recompile (e.g. on save / compile press). */
		trigger: number;
		/** bump for a QUIET recompile: the page holds, no "Compiling…" announcement -- for
		 * boundary-line edits (comments, labels) whose render is expected unchanged. */
		quietTrigger?: number;
		/** SyncTeX inverse: a double-click on a page resolved to a source location. */
		onInverseSync?: (file: string, line: number, selectText?: string) => void;
		/** a compile landed: the editor re-evaluates any edits typed while it ran. */
		onSettled?: () => void;
		/** a compile landed: its log is at this path, for the Problems panel to parse. */
		onDiagnostics?: (logPath: string) => void;
		/** docked in the pane, where this row stands in for a tab strip; false in the popped-out window */
		asTabStrip?: boolean;
		/** move the preview into its own window; null in the popped-out body, which needs no button */
		onPopout?: (() => void) | null;
	};
	let {
		root,
		mainFile,
		trigger,
		quietTrigger = 0,
		onInverseSync,
		onSettled,
		onDiagnostics,
		asTabStrip = true,
		onPopout = null
	}: Props = $props();

	const ctrl = new DraftSession({
		root: () => root,
		mainFile: () => mainFile,
		onInverseSync: () => onInverseSync,
		onSettled: () => onSettled,
		onDiagnostics: () => onDiagnostics
	});
	const vp = ctrl.vp;
	const compiler = ctrl.compiler;

	/** Instant path: re-typeset one edited paragraph on the warm daemon and splice it into its
	 * page -- only when provably identical to a full recompile. Called on every edit burst. */
	export async function instantPatch(req: PatchReq) {
		await ctrl.instantPatch(req);
	}
	/** register a structurally-edited paragraph to jump to after the recompile lands. */
	export function focusAfterCompile(req: { file: string; line: number; endLine: number; text: string; listItem?: boolean }) {
		ctrl.patcher.setFocus(req);
	}
	/** forward sync: scroll + flash the box synctex reported for a source line. */
	export function syncTo(pageNo: number, hBp: number, vBp: number, wBp: number, hgtBp: number) {
		ctrl.syncTo(pageNo, hBp, vBp, wBp, hgtBp);
	}

	// recompile whenever `trigger` changes (and once on mount). untrack the compile call:
	// compile() reads and writes $state, so without untrack this effect would take those as
	// dependencies and re-run itself into an infinite loop.
	$effect(() => {
		const t = trigger;
		untrack(() => void compiler.compile('trigger:' + t));
	});
	// quiet passes (boundary-line edits): same compile, no announcement. 0 = never bumped,
	// so this never duplicates the mount compile above.
	$effect(() => {
		const t = quietTrigger;
		if (t > 0) untrack(() => void compiler.compile('quiet:' + t));
	});
	// react to zoom changes (from buttons, wheel, or a fit-to-width): instant CSS resize +
	// debounced crisp re-render
	$effect(() => {
		void vp.zoom;
		if (!ctrl.pages.length) return;
		untrack(() => vp.onZoomChanged());
	});
	// re-fit when the pane resizes, until the user takes manual control
	$effect(() => {
		void vp.containerW;
		if (vp.fitMode) untrack(() => vp.fitToWidth());
	});
	// ctrl/cmd + wheel zooms; a plain wheel scrolls. The listener must be non-passive for
	// preventDefault to take, so attach it by hand once the scroller is bound.
	$effect(() => {
		const el = vp.scroller;
		if (!el) return;
		function onWheel(e: WheelEvent) {
			if (!(e.ctrlKey || e.metaKey)) return;
			e.preventDefault();
			untrack(() => vp.setZoom(vp.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
		}
		el.addEventListener('wheel', onWheel, { passive: false });
		return () => el.removeEventListener('wheel', onWheel);
	});
	// the losing side of a takeover pauses immediately rather than on the next keystroke
	$effect(() => compiler.attachPreempt());
</script>

<div class="bg-surface-200-800 flex h-full w-full flex-col">
	{#snippet status()}
		{#if compiler.error}
			<span class="text-error-ink shrink-0 text-sm">{m.draft_preview_error_label()}</span>
		{:else}
			<span class="truncate text-sm">{compiler.status}</span>
		{/if}
	{/snippet}
	{#snippet pages()}
		<input
			type="number"
			class="page-input"
			value={vp.curPage}
			min="1"
			max={ctrl.pages.length}
			onchange={(e) => {
				const n = parseInt(e.currentTarget.value, 10);
				if (n >= 1 && n <= ctrl.pages.length) vp.goToPage(n);
			}}
			aria-label={m.draft_toolbar_page_aria()}
			style:--digits={String(ctrl.pages.length).length}
		/>
		<span class="page-info">/ {ctrl.pages.length}</span>
		<button
			onclick={() => vp.goToPage(vp.curPage - 1)}
			disabled={vp.curPage <= 1}
			use:tip={m.draft_toolbar_prev_page()}
			aria-label={m.draft_toolbar_prev_page()}
		>
			<ChevronUp size={16} />
		</button>
		<button
			onclick={() => vp.goToPage(vp.curPage + 1)}
			disabled={vp.curPage >= ctrl.pages.length}
			use:tip={m.draft_toolbar_next_page()}
			aria-label={m.draft_toolbar_next_page()}
		>
			<ChevronDown size={16} />
		</button>
	{/snippet}
	{#snippet zoom()}
		<button
			onclick={() => vp.zoomOut()}
			disabled={!ctrl.pages.length}
			use:tip={m.draft_toolbar_zoom_out()}
			aria-label={m.draft_toolbar_zoom_out()}
		>
			<ZoomOut size={16} />
		</button>
		<button class="wide" onclick={() => vp.actualSize()} disabled={!ctrl.pages.length} use:tip={m.draft_toolbar_actual_size()}>
			{Math.round(vp.zoom * 100)}%
		</button>
		<button
			onclick={() => vp.zoomIn()}
			disabled={!ctrl.pages.length}
			use:tip={m.draft_toolbar_zoom_in()}
			aria-label={m.draft_toolbar_zoom_in()}
		>
			<ZoomIn size={16} />
		</button>
		<button
			aria-pressed={vp.fitMode}
			onclick={() => vp.fitWidthBtn()}
			disabled={!ctrl.pages.length}
			use:tip={m.draft_toolbar_fit_width()}
			aria-label={m.draft_toolbar_fit_width()}
		>
			<MoveHorizontal size={16} />
		</button>
	{/snippet}
	{#snippet follow()}
		<button
			aria-pressed={vp.followEdits}
			onclick={() => (vp.followEdits = !vp.followEdits)}
			disabled={!ctrl.pages.length}
			use:tip={vp.followEdits ? m.draft_toolbar_follow_edits_on() : m.draft_toolbar_follow_edits_off()}
			aria-label={m.draft_toolbar_follow_edits_aria()}
		>
			<Crosshair size={16} />
		</button>
	{/snippet}
	{#snippet save()}
		<button
			onclick={() => ctrl.savePdf()}
			disabled={!ctrl.pages.length || ctrl.savingPdf}
			use:tip={m.draft_toolbar_save_pdf()}
			aria-label={m.draft_toolbar_save_pdf()}
		>
			<Download size={16} />
		</button>
	{/snippet}
	{#snippet popout()}
		<button onclick={() => onPopout?.()} use:tip={m.wsview_popout_preview()} aria-label={m.wsview_popout_preview()}>
			<PictureInPicture2 size={16} />
		</button>
	{/snippet}
	<!-- the same row as the PDF viewer's, with the engine status where the file name would be -->
	<PreviewToolbar
		leading={status}
		trailing={onPopout ? popout : undefined}
		{asTabStrip}
		groups={[
			...(ctrl.pages.length ? [{ id: 'pages', render: pages }] : []),
			{ id: 'zoom', render: zoom },
			{ id: 'follow', render: follow },
			{ id: 'save', render: save }
		]}
	/>
	{#if compiler.busyElsewhere}
		<div
			class="border-surface-300-700 bg-surface-50-950 m-3 flex shrink-0 items-center justify-between gap-3 rounded-container border p-3 text-sm"
		>
			<span class="text-muted">{m.draft_busy_other_window()}</span>
			<button class="btn btn-xs preset-filled-primary-500 shrink-0" onclick={() => compiler.takeoverEngine()}
				>{m.draft_busy_takeover()}</button
			>
		</div>
	{/if}
	{#if compiler.error}
		<!-- Now a single line in the normal case (the log tail moved to Problems), but the cap stays
		     as a backstop: `error` can also be a thrown exception's message, and overflow-auto cannot
		     scroll a box that is free to grow. Without a height constraint this took its full content
		     height and the flex-1 scroller below it got whatever was left. -->
		<pre
			class="text-error-ink bg-surface-50-950 m-3 max-h-40 shrink-0 overflow-auto [scrollbar-gutter:stable] rounded-container p-3 text-xs whitespace-pre-wrap">{compiler.error}</pre>
	{/if}
	<div
		bind:this={vp.scroller}
		bind:clientWidth={vp.containerW}
		onscroll={() => vp.onScroll()}
		class="flex flex-1 flex-col items-center gap-4 overflow-auto [scrollbar-gutter:stable] p-4"
	>
		{#each ctrl.pages as p (p.n)}
			<div class="relative shadow-lg">
				<canvas bind:this={ctrl.canvasEls[p.n - 1]} ondblclick={(e) => ctrl.onCanvasDblClick(p.n, e)}></canvas>
				{#if vp.editBand && vp.editBand.page === p.n}
					<!-- the located band of the paragraph being edited; fades shortly after typing stops -->
					<div
						class="pointer-events-none absolute rounded-base bg-draft-band/30"
						transition:fade={{ duration: 300 }}
						style="left:{(ctrl.paper.mx + vp.editBand.colL) * vp.dispScale}px; top:{(ctrl.paper.my + vp.editBand.top - 2) *
							vp.dispScale}px; width:{(vp.editBand.colR - vp.editBand.colL) * vp.dispScale}px; height:{(vp.editBand.bottom -
							vp.editBand.top +
							4) *
							vp.dispScale}px"
					></div>
				{/if}
				{#if vp.clickMark && vp.clickMark.page === p.n}
					<!-- where the sync double-click landed -->
					<div
						class="pointer-events-none absolute"
						transition:fade={{ duration: 200 }}
						style="left:{vp.clickMark.x * vp.dispScale}px; top:{vp.clickMark.y * vp.dispScale}px"
					>
						<span class="border-primary-500 absolute size-6 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full border-2"></span>
						<span class="bg-primary-500 absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"></span>
					</div>
				{/if}
			</div>
			<div class="text-muted -mt-3 text-[10px]">{m.draft_page_label({ n: p.n })}</div>
		{/each}
	</div>
</div>
