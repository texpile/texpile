<script lang="ts">
	// Draws the app's own context menu; contextMenu.svelte.ts decides when. Mounted once, at the
	// app root, like the tooltip host.
	import { Check, ChevronRight } from '@lucide/svelte';
	import Kbd from '$lib/components/Kbd.svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { m } from '$lib/paraglide/messages';
	import { openMenu, closeContextMenu, type ContextMenuItem } from './contextMenu.svelte';
	import { menuItemClass, menuPanelClass, separatorClass } from './menuStyles';

	const EDGE = 8;
	// the card's own top padding, so a submenu's first item lines up with the item that opened it
	const PAD = 4;

	let card = $state<HTMLDivElement | null>(null);
	let subCard = $state<HTMLDivElement | null>(null);
	// measured against THIS menu before it paints, so it never shows for a frame off-screen
	let placed = $state.raw<{ x: number; y: number; for: object } | null>(null);
	let sub = $state.raw<{ items: ContextMenuItem[]; from: DOMRect; for: object } | null>(null);
	let subPlaced = $state.raw<{ x: number; y: number; for: object } | null>(null);

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

	$effect(() => {
		if (!sub || !subCard) return;
		const { offsetWidth: w, offsetHeight: h } = subCard;
		const right = sub.from.right - PAD;
		subPlaced = {
			x: right + w > window.innerWidth - EDGE ? Math.max(EDGE, sub.from.left - w + PAD) : right,
			y: Math.max(EDGE, Math.min(sub.from.top - PAD, window.innerHeight - h - EDGE)),
			for: sub
		};
	});

	function run(item: ContextMenuItem): void {
		if ('separator' in item || item.submenu) return;
		// close first: an item that opens an inline input needs the menu's focus hand-back to land
		// before the input takes focus
		closeContextMenu();
		item.onclick?.();
	}

	function hover(item: ContextMenuItem, el: HTMLElement): void {
		const menu = openMenu.current;
		if (!menu || 'separator' in item) return;
		sub = item.submenu && !item.disabled ? { items: item.submenu, from: el.getBoundingClientRect(), for: menu } : null;
	}
</script>

<svelte:window onkeydown={(e) => openMenu.current && e.key === 'Escape' && closeContextMenu()} />

{#snippet entries(items: ContextMenuItem[], top: boolean)}
	{#each items as item, i (i)}
		{#if 'separator' in item}
			<div class={separatorClass}></div>
		{:else}
			<!-- a disabled item's tip says why, so it still takes the pointer the menu style takes away -->
			<button
				type="button"
				role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
				aria-checked={item.checked}
				aria-haspopup={item.submenu ? 'menu' : undefined}
				class="{menuItemClass} {item.danger ? 'text-error-ink' : ''}"
				disabled={item.disabled}
				style={item.disabled && item.tip ? 'pointer-events: auto' : undefined}
				onclick={(e) => (item.submenu ? hover(item, e.currentTarget) : run(item))}
				onpointerenter={(e) => top && hover(item, e.currentTarget)}
				onmousedown={(e) => e.preventDefault()}
				use:tip={item.tip}
			>
				{#if item.checked}
					<Check class="size-4 shrink-0" />
				{:else if item.icon}
					{@const Icon = item.icon}
					<Icon class="size-4 shrink-0 {item.danger ? '' : 'text-muted'}" />
				{:else}
					<span class="size-4 shrink-0"></span>
				{/if}
				<span class="min-w-0 flex-1 truncate">{item.label}</span>
				{#if item.keys}<Kbd keys={item.keys} class="ml-auto" />{/if}
				{#if item.submenu}<ChevronRight class="text-muted ml-auto size-4 shrink-0" />{/if}
			</button>
		{/if}
	{/each}
{/snippet}

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
		class="{menuPanelClass} z-dropdown fixed min-w-48 overflow-hidden"
		style="left: {placed?.x ?? menu.x}px; top: {placed?.y ?? menu.y}px; opacity: {placed?.for === menu ? 1 : 0}"
	>
		{@render entries(menu.items, true)}
	</div>
	{#if sub?.for === menu}
		<div
			bind:this={subCard}
			role="menu"
			class="{menuPanelClass} z-dropdown fixed min-w-44 overflow-hidden"
			style="left: {subPlaced?.x ?? sub.from.right}px; top: {subPlaced?.y ?? sub.from.top}px; opacity: {subPlaced?.for === sub ? 1 : 0}"
		>
			{@render entries(sub.items, false)}
		</div>
	{/if}
{/if}
