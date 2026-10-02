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
	export type DropdownGroup = {
		label?: string;
		options: DropdownOption[];
		/** the rest of a long list, in a submenu at the group's end */
		more?: { label: string; options: DropdownOption[] };
	};
</script>

<script lang="ts">
	// a dropdown that picks from a short list, on Skeleton's Menu: arrow keys, typeahead and menu roles, in the look every
	// list shares (menuStyles.ts)
	import { Menu, Portal, type MenuTriggerProps } from '@skeletonlabs/skeleton-svelte';
	import { ChevronDown } from '@lucide/svelte';
	import { labelTriggerClass, menuContentClass, menuGroupLabelClass, separatorClass } from './menuStyles';
	import MenuDropdownOption from './MenuDropdownOption.svelte';
	import MenuDropdownMore from './MenuDropdownMore.svelte';

	type Props = {
		groups: DropdownGroup[];
		onSelect: (value: string) => void;
		/** radio picks one; checkbox options are set apart, as superscript and subscript are */
		kind?: 'radio' | 'checkbox';
		placement?: 'bottom-start' | 'bottom-end';
		/** what is picked, on the standard trigger */
		label?: string;
		/** every label the standard trigger can show, the options' own unless given: it is as wide as the widest */
		labels?: string[];
		/** a trigger of the caller's own: spread its `attrs` on the button */
		trigger?: MenuTriggerProps['element'];
	};

	const props: Props = $props();

	// the trigger keeps one width whatever is picked, so the toolbar after it does not move
	const reserved = $derived(props.labels ?? props.groups.flatMap((g) => [...g.options, ...(g.more?.options ?? [])].map((o) => o.label)));
	const marked = $derived(props.groups.some((g) => [...g.options, ...(g.more?.options ?? [])].some((o) => o.marker !== undefined)));

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
					<span class="grid min-w-[5.5rem] text-left">
						{#each reserved as l, i (i)}<span class="invisible col-start-1 row-start-1" aria-hidden="true">{l}</span>{/each}
						<span class="col-start-1 row-start-1">{props.label}</span>
					</span>
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
							<MenuDropdownOption {option} kind={props.kind ?? 'radio'} {marked} />
						{/each}
						{#if group.more?.options.length}
							<MenuDropdownMore
								label={group.more.label}
								options={group.more.options}
								kind={props.kind ?? 'radio'}
								{marked}
								onSelect={select}
							/>
						{/if}
					</Menu.ItemGroup>
				{/each}
			</Menu.Content>
		</Menu.Positioner>
	</Portal>
</Menu>
