<script lang="ts">
	// The preview toolbar's color vision control: one button, the simulations hung under it. The
	// button and the menu are siblings rather than wrapped, so the bar styles the button like its
	// neighbors; the menu is fixed-positioned and needs no box of its own.
	import { Check, Eye } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { menuContentClass, menuItemClass, separatorClass } from '$lib/menus/menuStyles';
	import { AnchoredMenu } from '$lib/pdf-view/anchoredMenu.svelte';
	import type { PreviewToolbarPlace } from '$lib/preview/PreviewToolbar.svelte';
	import { COLOR_VISION_MODES, colorVision, colorVisionLabel, type ColorVisionMode } from './colorVision';
	import { m } from '$lib/paraglide/messages';

	let { place = 'bar' }: { place?: PreviewToolbarPlace } = $props();

	const menu = new AnchoredMenu('end');
	const active = $derived(colorVision.current !== 'none');

	function pick(mode: ColorVisionMode): void {
		menu.close();
		colorVision.current = mode;
	}
</script>

<button
	bind:this={menu.button}
	class:menu-item={place === 'menu'}
	onclick={menu.toggle}
	aria-pressed={active}
	aria-haspopup="menu"
	aria-expanded={menu.open}
	aria-label={m.color_vision_button()}
	use:tip={active ? m.color_vision_badge({ mode: colorVisionLabel(colorVision.current) }) : m.color_vision_button()}
>
	<Eye size={16} />
	{#if place === 'menu'}<span class="cap-center">{m.color_vision_button()}</span>{#if active}<Check size={14} class="ml-auto" />{/if}{/if}
</button>
{#if menu.open}
	<div
		bind:this={menu.el}
		class="{menuContentClass} fixed"
		style={menu.style}
		role="menu"
		aria-label={m.color_vision_button()}
		{@attach menu.moveToBody}
	>
		{#each COLOR_VISION_MODES as mode (mode)}
			<button
				class="{menuItemClass} whitespace-nowrap"
				role="menuitemradio"
				aria-checked={colorVision.current === mode}
				onclick={() => pick(mode)}
			>
				<span class="cap-center">{colorVisionLabel(mode)}</span>
				{#if colorVision.current === mode}<Check size={14} class="ml-auto shrink-0" />{/if}
			</button>
			{#if mode === 'none'}<div class={separatorClass} role="separator"></div>{/if}
		{/each}
	</div>
{/if}
