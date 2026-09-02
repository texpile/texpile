<script lang="ts">
	// The top-level trigger for one menu: a button in the bar while the menu fits, or a submenu
	// row inside the overflow dropdown once it does not. Only the trigger differs between the
	// two layouts, so everything below it is shared by both passes.
	import { tip } from '$lib/components/tooltip.svelte';
	import { Menu } from '@skeletonlabs/skeleton-svelte';
	import { ChevronRight } from '@lucide/svelte';
	import { titleBarLayout } from '$lib/chrome/titleBarLayout.svelte';
	import { triggerClass, itemClass } from './menuBarStyles';

	type Props = {
		id: string;
		index: number;
		label: string;
		disabled?: boolean;
		title?: string;
		dot?: boolean;
	};

	let { id, index, label, disabled = false, title = '', dot = false }: Props = $props();

	const visible = $derived(titleBarLayout.visibleMenus);
</script>

{#if index >= visible}
	<Menu.TriggerItem value={id} class={itemClass} {disabled}>
		{#snippet element(attrs)}
			<div {...attrs} use:tip={title}>
				<Menu.ItemText>{label}</Menu.ItemText>
				<span class="flex items-center gap-1.5">
					{#if dot}<span class="bg-primary-500 inline-block size-1.5 rounded-full"></span>{/if}
					<ChevronRight class="size-4 opacity-60" />
				</span>
			</div>
		{/snippet}
	</Menu.TriggerItem>
{:else}
	<Menu.Trigger class={triggerClass} {disabled}>
		{#snippet element(attrs)}
			<button {...attrs} use:tip={title}>
				{label}
				{#if dot}<span class="bg-primary-500 mb-1.5 ml-0.5 inline-block size-1.5 rounded-full"></span>{/if}
			</button>
		{/snippet}
	</Menu.Trigger>
{/if}
