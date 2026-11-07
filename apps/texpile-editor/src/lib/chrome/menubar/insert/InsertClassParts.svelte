<script lang="ts">
	// the parts of the Insert menu the file's class and packages fill, one per category, each item with its package
	import { Menu } from '@skeletonlabs/skeleton-svelte';
	import MenuBarSubmenu from '../MenuBarSubmenu.svelte';
	import { menuBarItemClass, separatorClass } from '$lib/menus/menuStyles';
	import { insertItems } from '$lib/editor/visual/insert/insertItems.svelte';
	import { ITEM_VALUE, classParts } from './insertListSelect';

	const props: { select: (value: string) => void } = $props();

	const groups = $derived(classParts(insertItems.current));
</script>

{#if groups.length}
	<Menu.Separator class={separatorClass} />
	{#each groups as group (group.key)}
		<MenuBarSubmenu value={`part:${group.key}`} label={group.label ?? ''} select={props.select}>
			{#each group.items as item (item.id)}
				<Menu.Item value={ITEM_VALUE + item.id} class={menuBarItemClass}>
					<Menu.ItemText>{item.label}</Menu.ItemText>
					{#if item.hint}<span class="text-muted pl-4 text-xs">{item.hint}</span>{/if}
				</Menu.Item>
			{/each}
		</MenuBarSubmenu>
	{/each}
{/if}
