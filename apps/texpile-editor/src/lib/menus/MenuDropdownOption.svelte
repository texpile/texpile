<script lang="ts">
	// one choice in a MenuDropdown, in its list or in the submenu under it
	import { Menu } from '@skeletonlabs/skeleton-svelte';
	import { Check } from '@lucide/svelte';
	import { menuItemClass } from './menuStyles';
	import type { DropdownOption } from './MenuDropdown.svelte';

	type Props = {
		option: DropdownOption;
		kind: 'radio' | 'checkbox';
		/** some option in the menu has a marker, so every one keeps its column */
		marked: boolean;
	};
	const props: Props = $props();
</script>

<Menu.OptionItem
	type={props.kind}
	value={props.option.value}
	valueText={props.option.label}
	checked={props.option.checked}
	class={menuItemClass}
>
	{#if props.option.icon}
		{@const Icon = props.option.icon}
		<Icon class="size-4 shrink-0 {props.option.checked ? 'text-primary-ink' : 'text-muted'}" />
	{:else if props.marked}
		<span class="text-muted w-10 shrink-0 font-mono text-xs">{props.option.marker ?? ''}</span>
	{/if}
	<span class="min-w-0 flex-1">
		<Menu.ItemText class="block">{props.option.label}</Menu.ItemText>
		{#if props.option.note}<span class="text-muted block text-xs leading-relaxed">{props.option.note}</span>{/if}
	</span>
	{#if props.option.keys}<span class="text-muted text-xs">{props.option.keys}</span>{/if}
	<Check class="size-4 shrink-0 {props.option.checked ? '' : 'invisible'}" />
</Menu.OptionItem>
