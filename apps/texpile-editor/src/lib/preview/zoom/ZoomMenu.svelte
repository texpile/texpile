<script module lang="ts">
	import type { Component } from 'svelte';

	/** a fit mode at the top of the menu: Fit width, Fit page, Fit */
	export type ZoomFit = { label: string; icon: Component; run: () => void };
</script>

<script lang="ts">
	// the zoom readout is the trigger: the fit modes and the preset steps hang under it, the way
	// Acrobat's and pdf.js's zoom combo work. The PDF viewer and the image viewer share it
	import { ChevronDown, Check } from '@lucide/svelte';
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
		<div bind:this={menu.el} class="zoom-menu-list" style={menu.style} role="menu">
			{#each props.fits as fit (fit.label)}
				<button role="menuitem" onclick={() => pick(fit.run)}>
					<fit.icon size={16} />
					<span>{fit.label}</span>
				</button>
			{/each}
			<div class="zoom-menu-sep" role="separator"></div>
			{#each presets as p (p)}
				<button role="menuitem" onclick={() => pick(() => props.onscale(p / 100))}>
					<span class="zoom-menu-icon-gap"></span>
					<span>{p}%</span>
					{#if p === percent}<Check size={14} class="zoom-menu-check" />{/if}
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
		/* a control, so the buttons' ink; the pane title is the only muted text on the bar */
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

	.zoom-menu-list {
		position: fixed;
		z-index: 50;
		display: flex;
		flex-direction: column;
		min-width: calc(var(--spacing) * 40);
		padding: calc(var(--spacing) * 1);
		border-radius: calc(var(--radius-base) * 1.5);
		border: var(--default-border-width) solid var(--pdf-toolbar-border);
		background-color: var(--pdf-toolbar-bg);
		color: var(--pdf-toolbar-fg);
		box-shadow: 0 6px 18px rgb(0 0 0 / 0.18);
	}

	.zoom-menu-list button {
		display: flex;
		align-items: center;
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
		cursor: pointer;
	}

	.zoom-menu-list button:hover {
		background-color: var(--pdf-toolbar-btn-hover-bg);
	}

	.zoom-menu-list button > :global(svg:first-child) {
		flex-shrink: 0;
		color: var(--pdf-toolbar-muted);
	}

	.zoom-menu-icon-gap {
		width: 16px;
		flex-shrink: 0;
	}

	.zoom-menu-list :global(.zoom-menu-check) {
		margin-left: auto;
	}

	.zoom-menu-sep {
		height: var(--default-border-width);
		margin: calc(var(--spacing) * 1) calc(var(--spacing) * 1.5);
		background-color: var(--pdf-toolbar-border);
	}
</style>
