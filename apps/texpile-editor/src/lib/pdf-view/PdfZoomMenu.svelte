<script lang="ts">
	// the zoom readout is the trigger: the fit modes and the preset steps hang under it, the way
	// Acrobat's and pdf.js's zoom combo work
	import { ChevronDown, Check, MoveHorizontal, Maximize } from '@lucide/svelte';
	import { getPdfViewerContext } from './pdf-viewer/context';
	import { AnchoredMenu } from './anchoredMenu.svelte';

	const ctx = getPdfViewerContext();
	const menu = new AnchoredMenu('start');

	const PRESETS = [50, 75, 100, 125, 150, 200];
	const percent = $derived(Math.round(ctx.state.scale * 100));

	function pick(run: () => void) {
		menu.close();
		run();
	}
</script>

<div class="pdf-zoom">
	<button bind:this={menu.button} class="pdf-zoom-trigger" onclick={menu.toggle} aria-haspopup="menu" aria-expanded={menu.open}>
		<span class="pdf-zoom-value">{percent}%</span>
		<ChevronDown size={12} />
	</button>
	{#if menu.open}
		<div bind:this={menu.el} class="pdf-zoom-menu" style={menu.style} role="menu">
			<button role="menuitem" onclick={() => pick(ctx.actions.fitWidth)}>
				<MoveHorizontal size={16} />
				<span>Fit width</span>
			</button>
			<button role="menuitem" onclick={() => pick(ctx.actions.fitPage)}>
				<Maximize size={16} />
				<span>Fit page</span>
			</button>
			<div class="pdf-zoom-sep" role="separator"></div>
			{#each PRESETS as p (p)}
				<button role="menuitem" onclick={() => pick(() => ctx.actions.setScale(p / 100))}>
					<span class="pdf-zoom-icon-gap"></span>
					<span>{p}%</span>
					{#if p === percent}<Check size={14} class="pdf-zoom-check" />{/if}
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.pdf-zoom {
		position: relative;
		display: flex;
		align-items: center;
	}

	.pdf-zoom-trigger {
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

	.pdf-zoom-trigger:hover,
	.pdf-zoom-trigger[aria-expanded='true'] {
		background-color: var(--pdf-toolbar-btn-hover-bg);
		color: var(--pdf-toolbar-fg);
	}

	/* holds its width across 90% / 100% / 125% so the +/- on either side stay put */
	.pdf-zoom-value {
		min-width: calc(var(--spacing) * 10);
		text-align: center;
	}

	.pdf-zoom-menu {
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

	.pdf-zoom-menu button {
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

	.pdf-zoom-menu button:hover {
		background-color: var(--pdf-toolbar-btn-hover-bg);
	}

	.pdf-zoom-menu button > :global(svg:first-child) {
		flex-shrink: 0;
		color: var(--pdf-toolbar-muted);
	}

	.pdf-zoom-icon-gap {
		width: 16px;
		flex-shrink: 0;
	}

	.pdf-zoom-menu :global(.pdf-zoom-check) {
		margin-left: auto;
	}

	.pdf-zoom-sep {
		height: var(--default-border-width);
		margin: calc(var(--spacing) * 1) calc(var(--spacing) * 1.5);
		background-color: var(--pdf-toolbar-border);
	}
</style>
