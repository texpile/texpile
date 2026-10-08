<script lang="ts">
	// The preview split top and bottom: two views of the one PDF, each scrolled on its own with its own toolbar.
	// Unsplit it is the top view alone, the same one, so turning the split on or off keeps its place
	import { untrack, type Snippet } from 'svelte';
	import { getPdfViewerContext } from '$lib/pdf-view';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		split: boolean;
		/** the top view's share */
		fraction: number;
		onResize: (fraction: number) => void;
		/** one view, by its place: 0 on top */
		view: Snippet<[number]>;
		/** the lower view's bar height: its bottom edge drags the divider too */
		edge?: number;
		/** editors stacked beside it: one divider for both, `at` px below the top of the pane */
		link?: { at: number; columnHeight: number; moveTo: (y: number) => void; even: () => void; lit: 'idle' | 'hover' | 'drag' } | null;
	};
	const props: Props = $props();
	const ctx = getPdfViewerContext();
	let box = $state<HTMLElement>();

	// the bottom view opens where the top one is
	let placed = false;
	$effect(() => {
		const second = ctx.views[1];
		if (!second) {
			placed = false;
			return;
		}
		if (placed || second.state.loading || !second.state.totalPages) return;
		placed = true;
		const page = untrack(() => ctx.views[0]?.state.currentPage ?? 1);
		second.actions?.goToPage(page);
	});

	const LEAST = 0.15;
	function clamped(fraction: number): number {
		return Math.min(1 - LEAST, Math.max(LEAST, fraction));
	}
	function resizeTo(fraction: number): void {
		props.onResize(clamped(fraction));
	}

	// where the views start below the top of the pane (under the top bar), and how tall they are together
	let below = $state(0);
	let height = $state(0);
	let paneHeight = $state(0);
	function pane(): number | null {
		return box?.closest('aside')?.getBoundingClientRect().top ?? null;
	}
	$effect(() => {
		const el = box;
		if (!el) return;
		const ro = new ResizeObserver(() => {
			const top = pane();
			below = top === null ? 0 : el.getBoundingClientRect().top - top;
			height = el.clientHeight;
			paneHeight = el.closest('aside')?.clientHeight ?? 0;
		});
		ro.observe(el);
		return () => ro.disconnect();
	});
	// one divider only while the preview and the editors stand the same height
	const link = $derived(
		props.split && height > 1 && pane() !== null && props.link && Math.abs(paneHeight - props.link.columnHeight) <= 1 ? props.link : null
	);
	const fraction = $derived(link ? clamped((link.at - below) / (height - 1)) : props.fraction);
	// the split turned off, or the editors stopped lining up, while the divider was lit
	$effect(() => {
		const shared = link;
		return () => {
			if (shared && shared.lit !== 'drag') shared.lit = 'idle';
		};
	});
	function onPointerDown(event: PointerEvent) {
		if (event.button !== 0 || !box) return;
		event.preventDefault();
		const handle = event.currentTarget as HTMLElement;
		handle.setPointerCapture(event.pointerId);
		const area = box.getBoundingClientRect();
		const top = pane() ?? 0;
		// pressed on the lower bar's edge, below the divider: it moves with the pointer from where it is, not to it
		const offset = link ? event.clientY - top - link.at : event.clientY - (area.top + fraction * area.height);
		if (link) link.lit = 'drag';
		function move(e: PointerEvent): void {
			if (link) link.moveTo(e.clientY - top - offset);
			else resizeTo((e.clientY - offset - area.top) / area.height);
		}
		// capture goes on release and on a cancelled pointer alike: either ends the drag
		function up(): void {
			if (link) link.lit = 'idle';
			handle.removeEventListener('pointermove', move);
			handle.removeEventListener('lostpointercapture', up);
		}
		handle.addEventListener('pointermove', move);
		handle.addEventListener('lostpointercapture', up);
	}
	function onKeyDown(event: KeyboardEvent) {
		const step = event.key === 'ArrowUp' ? -0.05 : event.key === 'ArrowDown' ? 0.05 : 0;
		if (!step) return;
		event.preventDefault();
		if (link) link.moveTo(link.at + Math.sign(step) * 16);
		else resizeTo(props.fraction + step);
	}
</script>

<div bind:this={box} class="flex min-h-0 flex-1 flex-col">
	<div class="relative flex min-h-0 flex-col" style="flex: {props.split ? fraction : 1} 1 0">
		{@render props.view(0)}
	</div>
	{#if props.split}
		<div class="bg-surface-200-800 relative z-30 h-px shrink-0">
			<!-- a focusable separator is the ARIA pattern for a splitter; svelte counts it as non-interactive -->
			<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
			<div
				class="hover:bg-primary-wash active:bg-primary-flood absolute inset-x-0 -top-[3px] h-[7px] cursor-row-resize transition-colors {link?.lit ===
				'drag'
					? 'bg-primary-flood'
					: link?.lit === 'hover'
						? 'bg-primary-wash'
						: ''}"
				onpointerenter={() => link && link.lit !== 'drag' && (link.lit = 'hover')}
				onpointerleave={() => link && link.lit !== 'drag' && (link.lit = 'idle')}
				role="separator"
				aria-orientation="horizontal"
				aria-label={m.pdf_split_resize()}
				tabindex="0"
				onpointerdown={onPointerDown}
				ondblclick={() => (link ? link.even() : props.onResize(0.5))}
				onkeydown={onKeyDown}
			></div>
			{#if props.edge}
				<!-- the lower view's bar reads as part of the divider, so its bottom edge drags it too -->
				<div
					class="hover:bg-primary-wash active:bg-primary-flood absolute inset-x-0 h-[7px] cursor-row-resize transition-colors {link?.lit ===
					'drag'
						? 'bg-primary-flood'
						: link?.lit === 'hover'
							? 'bg-primary-wash'
							: ''}"
					style="top: {props.edge - 3}px"
					onpointerenter={() => link && link.lit !== 'drag' && (link.lit = 'hover')}
					onpointerleave={() => link && link.lit !== 'drag' && (link.lit = 'idle')}
					onpointerdown={onPointerDown}
					ondblclick={() => (link ? link.even() : props.onResize(0.5))}
					aria-hidden="true"
				></div>
			{/if}
		</div>
		<div class="relative flex min-h-0 flex-col" style="flex: {1 - fraction} 1 0">
			{@render props.view(1)}
		</div>
	{/if}
</div>
