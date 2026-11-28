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
	disabled={props.option.disabled}
	class={menuItemClass}
>
	{#if props.option.icon}
		{@const Icon = props.option.icon}
		<Icon class="size-4 shrink-0 {props.option.checked ? 'text-primary-ink' : 'text-muted'}" />
	{:else if props.option.iconPath}
		<svg
			class="size-4 shrink-0 {props.option.checked ? 'text-primary-ink' : 'text-muted'}"
			viewBox="0 0 24 24"
			fill="currentColor"
			aria-hidden="true"><path d={props.option.iconPath} /></svg
		>
	{:else if props.marked}
		<span class="text-muted w-10 shrink-0 font-mono text-xs">{props.option.marker ?? ''}</span>
	{/if}
	<!-- an agent's own text can run to a paragraph -->
	<span class="max-w-80 min-w-0 flex-1">
		<Menu.ItemText class="block truncate">{props.option.label}</Menu.ItemText>
		{#if props.option.note}<span class="text-muted line-clamp-2 text-xs leading-relaxed">{props.option.note}</span>{/if}
	</span>
	{#if props.option.keys}<span class="text-muted text-xs">{props.option.keys}</span>{/if}
	<Check class="size-4 shrink-0 {props.option.checked ? '' : 'invisible'}" />
</Menu.OptionItem>
