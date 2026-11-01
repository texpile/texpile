<script lang="ts">
	import { FileText } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { menuContentClass, menuItemClass } from '$lib/menus/menuStyles';
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
	<div
		bind:this={menu.el}
		class="{menuContentClass} fixed"
		style={menu.style}
		role="menu"
		aria-label={m.image_uses_tip()}
		{@attach menu.moveToBody}
	>
		{#each props.uses as use (`${use.path}:${use.line}`)}
			<button class={menuItemClass} role="menuitem" onclick={() => pick(use)}>
				<span class="cap-center">{m.image_uses_line({ file: pathInFolder(use.path, props.root), line: use.line })}</span>
			</button>
		{/each}
	</div>
{/if}
