<script lang="ts">
	// the documents that include this image; a pick opens one at its line
	import { FileText } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { AnchoredMenu } from '$lib/pdf-view/anchoredMenu.svelte';
	import { requestShowLine } from '$lib/workspace/showLine';
	import { m } from '$lib/paraglide/messages';
	import { pathInFolder, type ImageUse } from './imageUses';

	type Props = { uses: ImageUse[]; root: string };
	const props: Props = $props();

	const menu = new AnchoredMenu('start');

	function pick(use: ImageUse): void {
		menu.close();
		requestShowLine(use.path, use.line);
	}
</script>

<button
	bind:this={menu.button}
	class="wide"
	disabled={!props.uses.length}
	onclick={menu.toggle}
	aria-haspopup="menu"
	aria-expanded={menu.open}
	aria-label={m.image_uses_tip()}
	use:tip={props.uses.length ? m.image_uses_tip() : m.image_uses_none()}
>
	<FileText size={16} />
	<span class="cap-center tabular-nums">{props.uses.length}</span>
</button>
{#if menu.open}
	<div bind:this={menu.el} class="image-uses-menu" style={menu.style} role="menu" aria-label={m.image_uses_tip()}>
		{#each props.uses as use (`${use.path}:${use.line}`)}
			<button role="menuitem" onclick={() => pick(use)}>
				<span class="cap-center">{m.image_uses_line({ file: pathInFolder(use.path, props.root), line: use.line })}</span>
			</button>
		{/each}
	</div>
{/if}

<style>
	/* the zoom menu's shape, so the dropdowns on the bar read as one family */
	.image-uses-menu {
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

	.image-uses-menu button {
		display: flex;
		align-items: center;
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

	.image-uses-menu button:hover {
		background-color: var(--pdf-toolbar-btn-hover-bg);
	}
</style>
