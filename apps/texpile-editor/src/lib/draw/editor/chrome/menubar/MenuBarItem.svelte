<script lang="ts">
	import { Menu } from '@skeletonlabs/skeleton-svelte';
	import { menuBarItemClass } from '../../ui/menuStyles';

	type Props = { value: string; label: string; shortcut?: string; disabled?: boolean };
	const props: Props = $props();
</script>

<Menu.Item value={props.value} class={menuBarItemClass} disabled={props.disabled}>
	<Menu.ItemText>{props.label}</Menu.ItemText>
	{#if props.shortcut}<span class="opacity-50">{props.shortcut}</span>{/if}
</Menu.Item>
