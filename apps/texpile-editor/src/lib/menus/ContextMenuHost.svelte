<script lang="ts">
	// Draws the app's own context menu; contextMenu.svelte.ts decides when. Mounted once, at the
	// app root, like the tooltip host.
	import Kbd from '$lib/components/Kbd.svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { m } from '$lib/paraglide/messages';
	import { openMenu, closeContextMenu, type ContextMenuItem } from './contextMenu.svelte';

	const EDGE = 8;

	let card = $state<HTMLDivElement | null>(null);
	// measured against THIS menu before it paints, so it never shows for a frame off-screen
	let placed = $state.raw<{ x: number; y: number; for: object } | null>(null);

	$effect(() => {
		const menu = openMenu.current;
		if (!menu || !card) return;
		const { offsetWidth: w, offsetHeight: h } = card;
		placed = {
			x: Math.min(menu.x, window.innerWidth - w - EDGE),
			y: Math.min(menu.y, window.innerHeight - h - EDGE),
			for: menu
		};
	});

	function run(item: ContextMenuItem): void {
		// close first: an item that opens an inline input needs the menu's focus hand-back to land
		// before the input takes focus
		closeContextMenu();
		if (!('separator' in item)) item.onclick();
	}
</script>

<svelte:window onkeydown={(e) => openMenu.current && e.key === 'Escape' && closeContextMenu()} />

{#if openMenu.current}
	{@const menu = openMenu.current}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-dropdown cursor-default"
		onpointerdown={closeContextMenu}
		oncontextmenu={(e) => (e.preventDefault(), closeContextMenu())}
	></div>
	<div
		bind:this={card}
		role="menu"
		aria-label={m.tbar_close_menu_aria()}
		class="bg-surface-50-950 border-surface-300-700 z-dropdown fixed min-w-48 overflow-hidden rounded-base border py-1 text-sm shadow-lg"
		style="left: {placed?.x ?? menu.x}px; top: {placed?.y ?? menu.y}px; opacity: {placed?.for === menu ? 1 : 0}"
	>
		{#each menu.items as item, i (i)}
			{#if 'separator' in item}
				<div class="border-surface-200-800 my-1 border-t"></div>
			{:else}
				<button
					type="button"
					role="menuitem"
					class="flex w-full items-center gap-2.5 px-3 py-1.5 text-left disabled:pointer-events-none disabled:opacity-40 {item.danger
						? 'hover:preset-tonal-error text-error-600'
						: 'hover:preset-tonal-primary'}"
					disabled={item.disabled}
					onclick={() => run(item)}
					onmousedown={(e) => e.preventDefault()}
					use:tip={item.tip}
				>
					{#if item.icon}
						{@const Icon = item.icon}
						<Icon class="size-4 shrink-0 {item.danger ? '' : 'text-muted'}" />
					{:else}
						<span class="size-4 shrink-0"></span>
					{/if}
					<span class="min-w-0 flex-1 truncate">{item.label}</span>
					{#if item.keys}<Kbd keys={item.keys} class="ml-auto" />{/if}
				</button>
			{/if}
		{/each}
	</div>
{/if}
