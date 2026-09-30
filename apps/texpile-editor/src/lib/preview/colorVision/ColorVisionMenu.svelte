<script lang="ts">
	// The preview toolbar's color vision control: one button, the simulations hung under it. The
	// button and the menu are siblings rather than wrapped, so the bar styles the button like its
	// neighbors; the menu is fixed-positioned and needs no box of its own.
	import { Check, Eye } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
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
	{#if place === 'menu'}<span class="cap-center">{m.color_vision_button()}</span>{/if}
</button>
{#if menu.open}
	<div bind:this={menu.el} class="color-vision-menu" style={menu.style} role="menu" aria-label={m.color_vision_button()}>
		{#each COLOR_VISION_MODES as mode (mode)}
			<button role="menuitemradio" aria-checked={colorVision.current === mode} onclick={() => pick(mode)}>
				<span class="cap-center">{colorVisionLabel(mode)}</span>
				{#if colorVision.current === mode}<Check size={14} />{/if}
			</button>
			{#if mode === 'none'}<div class="color-vision-sep" role="separator"></div>{/if}
		{/each}
	</div>
{/if}

<style>
	/* the zoom menu's shape, so the two dropdowns on the bar read as one family */
	.color-vision-menu {
		position: fixed;
		z-index: 50;
		display: flex;
		flex-direction: column;
		min-width: calc(var(--spacing) * 56);
		padding: calc(var(--spacing) * 1);
		border-radius: calc(var(--radius-base) * 1.5);
		border: var(--default-border-width) solid var(--pdf-toolbar-border);
		background-color: var(--pdf-toolbar-bg);
		color: var(--pdf-toolbar-fg);
		box-shadow: 0 6px 18px rgb(0 0 0 / 0.18);
	}

	.color-vision-menu button {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: calc(var(--spacing) * 2.5);
		width: 100%;
		padding: calc(var(--spacing) * 1.5) calc(var(--spacing) * 2.5);
		border: 0;
		border-radius: var(--radius-base);
		background-color: transparent;
		color: inherit;
		font-family: inherit;
		font-size: 0.8125rem;
		text-align: left;
		white-space: nowrap;
		cursor: pointer;
	}

	.color-vision-menu button:hover {
		background-color: var(--pdf-toolbar-btn-hover-bg);
	}

	.color-vision-sep {
		height: var(--default-border-width);
		margin: calc(var(--spacing) * 1) calc(var(--spacing) * 1.5);
		background-color: var(--pdf-toolbar-border);
	}
</style>
