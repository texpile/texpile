<script lang="ts">
	// A toolbar row that collapses into a trailing "..." instead of scrolling out of reach.
	//
	// Items render inline for as long as they fit; the rest move into the overflow panel,
	// LAST-collapsible-first. `pinned` items never move, which is what lets a bar keep its essential
	// controls and hide only the optional ones - and why the collapsible set need not be a suffix
	// (the PDF bar's rotate pair sits mid-row).
	//
	// The row NEVER scrolls. Collapsing is the only answer to a bar that doesn't fit, so a control is
	// either on the bar or one click away, never off-screen somewhere you'd have to drag to find.
	import type { Snippet } from 'svelte';
	import { MoreHorizontal } from '@lucide/svelte';

	export type OverflowItem = {
		id: string;
		/** never collapses; the bar's essential controls */
		pinned?: boolean;
		/** payload for bars whose controls come from a list rather than being written out one by one:
		 *  one snippet reads this instead of needing a snippet per control */
		payload?: unknown;
		render: Snippet<[OverflowItem]>;
	};

	let {
		items,
		gapClass = 'gap-3 2xl:gap-4',
		menuLabel = 'More toolbar actions'
	}: { items: OverflowItem[]; gapClass?: string; menuLabel?: string } = $props();

	let row = $state<HTMLDivElement>();
	let menuButton = $state<HTMLButtonElement>();
	let menuEl = $state<HTMLDivElement>();
	let menuOpen = $state(false);
	let menuPos = $state({ top: 0, right: 0 });

	// The trigger must not take focus. Toolbars act on whatever the user was editing, and the math
	// bar in particular reads document.activeElement to find the mathfield it should insert into -
	// so a trigger that stole focus left it reading a stale caret and symbols landed at the end of
	// the equation instead of where the user was. Every control inside these bars does the same.
	function toggleMenu(): void {
		if (!menuOpen && menuButton) {
			const r = menuButton.getBoundingClientRect();
			// right-anchored so the menu grows inward and cannot run off the window edge
			menuPos = { top: r.bottom + 4, right: Math.max(4, window.innerWidth - r.right) };
		}
		menuOpen = !menuOpen;
	}
	/** how many collapsible items are currently in the menu, counting from the last one */
	let collapsed = $state(0);

	const collapsibleCount = $derived(items.filter((i) => !i.pinned).length);
	/** ids of the collapsible items, in the order they collapse (last first) */
	const collapseOrder = $derived(
		items
			.filter((i) => !i.pinned)
			.map((i) => i.id)
			.reverse()
	);
	const hiddenIds = $derived(new Set(collapseOrder.slice(0, collapsed)));
	const shown = $derived(items.filter((i) => !hiddenIds.has(i.id)));
	const hidden = $derived(items.filter((i) => hiddenIds.has(i.id)));

	// The row width at which each step was taken. Restoring an item only when the row is wider than
	// it was when we hid it is what stops the fit loop oscillating: without it, showing one more
	// overflows, we hide it again, and the toolbar flickers forever at one specific width.
	const widthAt: number[] = [];

	let frame = 0;
	function schedule(): void {
		if (frame) return;
		frame = requestAnimationFrame(() => {
			frame = 0;
			fit();
		});
	}

	function fit(): void {
		const el = row;
		if (!el) return;
		// +1 absorbs sub-pixel rounding, which otherwise reads as a permanent 0.5px overflow
		const over = el.scrollWidth > el.clientWidth + 1;
		if (over && collapsed < collapsibleCount) {
			widthAt[collapsed + 1] = el.clientWidth;
			collapsed++;
			schedule(); // one step per frame; re-measure with the item actually gone
			return;
		}
		if (!over && collapsed > 0 && el.clientWidth > (widthAt[collapsed] ?? 0) + 8) {
			collapsed--;
			schedule();
			return;
		}
	}

	// Dismiss on any pointer down outside, and on Escape. Deliberately NOT a scrim element: a scrim
	// only intercepts clicks if it paints above everything, and inside a component it competes in
	// whatever stacking context it lands in - the PDF canvas painted over it and ate the click.
	$effect(() => {
		if (!menuOpen) return;
		function onDown(e: PointerEvent) {
			const t = e.target as Node | null;
			if (t && (menuEl?.contains(t) || menuButton?.contains(t))) return;
			// A control in the menu may open a popover that PORTALS to document.body - the math symbol
			// grids do. That content is outside menuEl by construction, so treating it as "outside"
			// tore the menu down mid-click: the symbol never inserted and the mathfield lost focus.
			if (t instanceof Element && t.closest('[data-scope]')) return;
			menuOpen = false;
		}
		function onKey(e: KeyboardEvent) {
			if (e.key === 'Escape') menuOpen = false;
		}
		window.addEventListener('pointerdown', onDown, true);
		window.addEventListener('keydown', onKey, true);
		return () => {
			window.removeEventListener('pointerdown', onDown, true);
			window.removeEventListener('keydown', onKey, true);
		};
	});

	$effect(() => {
		const el = row;
		if (!el) return;
		const ro = new ResizeObserver(schedule);
		ro.observe(el);
		schedule();
		return () => {
			ro.disconnect();
			if (frame) cancelAnimationFrame(frame);
			frame = 0;
		};
	});

	// re-fit when the item set itself changes (a mode switch swaps the controls out)
	$effect(() => {
		void items.length;
		schedule();
	});
</script>

<div class="flex min-w-0 flex-1 items-center {gapClass}">
	<div bind:this={row} class="toolbar-fit flex min-w-0 flex-1 items-center {gapClass}">
		{#each shown as item (item.id)}
			{@render item.render(item)}
		{/each}
	</div>

	{#if hidden.length > 0}
		<div class="shrink-0">
			<button
				bind:this={menuButton}
				class="toolbarButton hover:preset-tonal flex items-center p-1"
				onclick={toggleMenu}
				onmousedown={(e) => e.preventDefault()}
				aria-label={menuLabel}
				aria-expanded={menuOpen}
			>
				<MoreHorizontal class="h-5 w-5" />
			</button>
			{#if menuOpen}
				<!-- fixed, not absolute: every toolbar sits in an overflow container, and an absolutely
				     positioned menu hanging below the bar is clipped away by it - the button opened
				     nothing at all. fixed escapes the clip. -->
				<div
					bind:this={menuEl}
					class="bg-surface-50-950 border-surface-300-700 fixed z-50 flex max-w-[min(22rem,calc(100vw-1rem))] flex-wrap items-center gap-3 gap-y-2 rounded-container border p-2 shadow-lg"
					style="top: {menuPos.top}px; right: {menuPos.right}px"
					role="group"
				>
					{#each hidden as item (item.id)}
						{@render item.render(item)}
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.toolbar-fit {
		overflow: hidden;
	}
	/* The measurement depends on this. Flex children shrink by default, so without it the controls
	   just compress to fit, scrollWidth never exceeds clientWidth, and the fit loop concludes
	   everything fits at every width - which is exactly why the bars clipped instead of collapsing. */
	.toolbar-fit > :global(*) {
		flex-shrink: 0;
	}
</style>
