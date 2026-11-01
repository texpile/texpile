<script module lang="ts">
	import type { Component } from 'svelte';

	export type ZoomFit = { label: string; icon: Component; run: () => void };
</script>

<script lang="ts">
	import { ChevronDown, Check } from '@lucide/svelte';
	import { menuContentClass, menuItemClass, separatorClass } from '$lib/menus/menuStyles';
	import { AnchoredMenu } from '$lib/pdf-view/anchoredMenu.svelte';

	type Props = { scale: number; fits: ZoomFit[]; onscale: (scale: number) => void; presets?: number[] };
	const props: Props = $props();
	const presets = $derived(props.presets ?? [50, 75, 100, 125, 150, 200]);

	const menu = new AnchoredMenu('start');
	const percent = $derived(Math.round(props.scale * 100));

	function pick(run: () => void) {
		menu.close();
		run();
	}
</script>

<div class="zoom-menu">
	<button bind:this={menu.button} class="zoom-menu-trigger" onclick={menu.toggle} aria-haspopup="menu" aria-expanded={menu.open}>
		<span class="zoom-menu-value">{percent}%</span>
		<ChevronDown size={12} />
	</button>
	{#if menu.open}
		<div bind:this={menu.el} class="{menuContentClass} fixed" style={menu.style} role="menu" {@attach menu.moveToBody}>
			{#each props.fits as fit (fit.label)}
				<button class={menuItemClass} role="menuitem" onclick={() => pick(fit.run)}>
					<fit.icon size={16} class="text-muted shrink-0" />
					<span class="cap-center">{fit.label}</span>
				</button>
			{/each}
			<div class={separatorClass} role="separator"></div>
			{#each presets as p (p)}
				<button class={menuItemClass} role="menuitem" onclick={() => pick(() => props.onscale(p / 100))}>
					<span class="w-4 shrink-0"></span>
					<span class="cap-center">{p}%</span>
					{#if p === percent}<Check size={14} class="ml-auto shrink-0" />{/if}
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.zoom-menu {
		position: relative;
		display: flex;
		align-items: center;
	}

	.zoom-menu-trigger {
		display: inline-flex;
		align-items: center;
		gap: calc(var(--spacing) * 0.5);
		height: var(--pdf-ctl, calc(var(--spacing) * 7));
		padding: 0 calc(var(--spacing) * 1.5);
		border: 0;
		border-radius: calc(var(--radius-base) * 1.5);
		background-color: transparent;
		color: var(--pdf-toolbar-btn-fg);
		font-family: inherit;
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.zoom-menu-trigger:hover,
	.zoom-menu-trigger[aria-expanded='true'] {
		background-color: var(--pdf-toolbar-btn-hover-bg);
		color: var(--pdf-toolbar-fg);
	}

	/* holds its width across 90% / 100% / 125% so the +/- on either side stay put */
	.zoom-menu-value {
		min-width: calc(var(--spacing) * 10);
		text-align: center;
	}
</style>
