<script lang="ts" module>
	import type { Component } from 'svelte';

	export type DropdownOption = {
		value: string;
		label: string;
		checked: boolean;
		/** a short mark before the label, such as `1.1` or `==` */
		marker?: string;
		icon?: Component<{ class?: string }>;
		/** a line under the label saying what the option does */
		note?: string;
		/** its shortcut, as shortcutText writes it */
		keys?: string;
	};
	export type DropdownGroup = { label?: string; options: DropdownOption[] };
</script>

<script lang="ts">
	// a dropdown that picks from a short list, on Skeleton's Menu: arrow keys, typeahead and menu roles, in the look every
	// list shares (menuStyles.ts)
	import { Menu, Portal, type MenuTriggerProps } from '@skeletonlabs/skeleton-svelte';
	import { Check, ChevronDown } from '@lucide/svelte';
	import { labelTriggerClass, menuContentClass, menuGroupLabelClass, menuItemClass, separatorClass } from './menuStyles';

	type Props = {
		groups: DropdownGroup[];
		onSelect: (value: string) => void;
		/** radio picks one; checkbox options are set apart, as superscript and subscript are */
		kind?: 'radio' | 'checkbox';
		placement?: 'bottom-start' | 'bottom-end';
		/** what is picked, on the standard trigger */
		label?: string;
		/** a trigger of the caller's own: spread its `attrs` on the button */
		trigger?: MenuTriggerProps['element'];
	};

	const props: Props = $props();

	const marked = $derived(props.groups.some((g) => g.options.some((o) => o.marker !== undefined)));

	// the menu hands the focus back to its trigger after a pick, which would undo a pick that focuses the editor
	function select(value: string) {
		setTimeout(() => props.onSelect(value));
	}
</script>

<Menu onSelect={(d) => select(d.value)} positioning={{ placement: props.placement ?? 'bottom-start', offset: { mainAxis: 4 } }}>
	<Menu.Trigger>
		{#snippet element(attrs)}
			{#if props.trigger}
				{@render props.trigger(attrs)}
			{:else}
				<button {...attrs} class={labelTriggerClass}>
					<span class="min-w-[5.5rem] text-left">{props.label}</span>
					<ChevronDown class="text-muted size-4 shrink-0" />
				</button>
			{/if}
		{/snippet}
	</Menu.Trigger>
	<Portal>
		<Menu.Positioner>
			<Menu.Content class={menuContentClass}>
				{#each props.groups as group, i (i)}
					{#if i > 0 && !group.label}<Menu.Separator class={separatorClass} />{/if}
					<Menu.ItemGroup>
						{#if group.label}<Menu.ItemGroupLabel class={menuGroupLabelClass}>{group.label}</Menu.ItemGroupLabel>{/if}
						{#each group.options as option (option.value)}
							<Menu.OptionItem
								type={props.kind ?? 'radio'}
								value={option.value}
								valueText={option.label}
								checked={option.checked}
								class={menuItemClass}
							>
								{#if option.icon}
									{@const Icon = option.icon}
									<Icon class="size-4 shrink-0 {option.checked ? 'text-primary-ink' : 'text-muted'}" />
								{:else if marked}
									<span class="text-muted w-10 shrink-0 font-mono text-xs">{option.marker ?? ''}</span>
								{/if}
								<span class="min-w-0 flex-1">
									<Menu.ItemText class="block">{option.label}</Menu.ItemText>
									{#if option.note}<span class="text-muted block text-xs leading-relaxed">{option.note}</span>{/if}
								</span>
								{#if option.keys}<span class="text-muted text-xs">{option.keys}</span>{/if}
								<Check class="size-4 shrink-0 {option.checked ? '' : 'invisible'}" />
							</Menu.OptionItem>
						{/each}
					</Menu.ItemGroup>
				{/each}
			</Menu.Content>
		</Menu.Positioner>
	</Portal>
</Menu>
