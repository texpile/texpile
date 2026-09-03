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
	import { ZoomIn, ZoomOut, MoveHorizontal, ChevronUp, ChevronDown, Crosshair, Download } from '@lucide/svelte';
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
	};
	let { root, mainFile, trigger, quietTrigger = 0, onInverseSync, onSettled, onDiagnostics }: Props = $props();

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
	<!-- one toolbar row: status on the left, zoom + page-nav on the right ("Draft preview"
	     already labels the pane header above) -->
	<div class="border-surface-300-700 text-muted flex min-h-10 shrink-0 items-center gap-1 border-b px-2 text-xs">
		{#if compiler.error}<span class="text-error-500 shrink-0">{m.draft_preview_error_label()}</span>{:else}<span
				class="text-surface-700-200 truncate">{compiler.status}</span
			>{/if}
		<div class="flex-1"></div>
		<button
			class="hover:preset-tonal rounded-base p-1 disabled:opacity-40"
			onclick={() => ctrl.savePdf()}
			disabled={!ctrl.pages.length || ctrl.savingPdf}
			use:tip={m.draft_toolbar_save_pdf()}
			aria-label={m.draft_toolbar_save_pdf()}
		>
			<Download class="size-4" />
		</button>
		<span class="bg-surface-300-700 mx-1 h-4 w-px shrink-0"></span>
		<button
			class="hover:preset-tonal rounded-base p-1 disabled:opacity-40"
			onclick={() => vp.zoomOut()}
			disabled={!ctrl.pages.length}
			use:tip={m.draft_toolbar_zoom_out()}
			aria-label={m.draft_toolbar_zoom_out()}
		>
			<ZoomOut class="size-4" />
		</button>
		<button
			class="hover:preset-tonal min-w-11 rounded-base px-1 py-1 text-center tabular-nums"
			onclick={() => vp.actualSize()}
			disabled={!ctrl.pages.length}
			use:tip={m.draft_toolbar_actual_size()}
		>
			{Math.round(vp.zoom * 100)}%
		</button>
		<button
			class="hover:preset-tonal rounded-base p-1 disabled:opacity-40"
			onclick={() => vp.zoomIn()}
			disabled={!ctrl.pages.length}
			use:tip={m.draft_toolbar_zoom_in()}
			aria-label={m.draft_toolbar_zoom_in()}
		>
			<ZoomIn class="size-4" />
		</button>
		<button
			class="hover:preset-tonal rounded-base p-1 disabled:opacity-40"
			class:preset-tonal={vp.fitMode}
			onclick={() => vp.fitWidthBtn()}
			disabled={!ctrl.pages.length}
			use:tip={m.draft_toolbar_fit_width()}
			aria-label={m.draft_toolbar_fit_width()}
		>
			<MoveHorizontal class="size-4" />
		</button>
		<button
			class="hover:preset-tonal rounded-base p-1 disabled:opacity-40"
			class:preset-tonal={vp.followEdits}
			class:text-primary-500={vp.followEdits}
			onclick={() => (vp.followEdits = !vp.followEdits)}
			disabled={!ctrl.pages.length}
			use:tip={vp.followEdits ? m.draft_toolbar_follow_edits_on() : m.draft_toolbar_follow_edits_off()}
			aria-label={m.draft_toolbar_follow_edits_aria()}
			aria-pressed={vp.followEdits}
		>
			<Crosshair class="size-4" />
		</button>
		{#if ctrl.pages.length}
			<span class="bg-surface-300-700 mx-1 h-4 w-px shrink-0"></span>
			<button
				class="hover:preset-tonal rounded-base p-1 disabled:opacity-40"
				onclick={() => vp.goToPage(vp.curPage - 1)}
				disabled={vp.curPage <= 1}
				use:tip={m.draft_toolbar_prev_page()}
				aria-label={m.draft_toolbar_prev_page()}
			>
				<ChevronUp class="size-4" />
			</button>
			<span class="shrink-0 tabular-nums">{vp.curPage} / {ctrl.pages.length}</span>
			<button
				class="hover:preset-tonal rounded-base p-1 disabled:opacity-40"
				onclick={() => vp.goToPage(vp.curPage + 1)}
				disabled={vp.curPage >= ctrl.pages.length}
				use:tip={m.draft_toolbar_next_page()}
				aria-label={m.draft_toolbar_next_page()}
			>
				<ChevronDown class="size-4" />
			</button>
		{/if}
	</div>
	{#if compiler.busyElsewhere}
		<div
			class="border-surface-300-700 bg-surface-50-950 m-3 flex shrink-0 items-center justify-between gap-3 rounded-base border p-3 text-sm"
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
			class="text-error-500 bg-surface-50-950 m-3 max-h-40 shrink-0 overflow-auto rounded-base p-3 text-xs whitespace-pre-wrap">{compiler.error}</pre>
	{/if}
	<div
		bind:this={vp.scroller}
		bind:clientWidth={vp.containerW}
		onscroll={() => vp.onScroll()}
		class="flex flex-1 flex-col items-center gap-4 overflow-auto p-4"
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
