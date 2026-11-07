<script lang="ts">
	import { Menu } from '@skeletonlabs/skeleton-svelte';
	import MenuBarSubmenu from '../MenuBarSubmenu.svelte';
	import { menuBarItemClass, separatorClass } from '$lib/menus/menuStyles';
	import type { CaretArgument } from '$lib/editor/visual/insert/insertItem';
	import { m } from '$lib/paraglide/messages';
	import { ARGUMENT_VALUE } from './insertListSelect';

	const props: { arguments: readonly CaretArgument[]; grouped: boolean; select: (value: string) => void } = $props();
</script>

{#snippet items()}
	{#each props.arguments as argument (argument.id)}
		<Menu.Item value={ARGUMENT_VALUE + argument.id} class={menuBarItemClass}>
			<Menu.ItemText>{argument.label}{argument.asks ? '…' : ''}</Menu.ItemText>
		</Menu.Item>
	{/each}
{/snippet}

{#if props.arguments.length}
	{#if props.grouped}
		<MenuBarSubmenu value="arguments" label={m.insert_arguments_menu()} select={props.select}>
			{@render items()}
		</MenuBarSubmenu>
	{:else}
		{@render items()}
	{/if}
	<Menu.Separator class={separatorClass} />
{/if}
