<script lang="ts">
	// the row at the end of a MenuDropdown group that opens the rest of its choices beside it
	import { Menu, Portal } from '@skeletonlabs/skeleton-svelte';
	import { ChevronRight } from '@lucide/svelte';
	import { menuContentClass, menuItemClass } from './menuStyles';
	import MenuDropdownOption from './MenuDropdownOption.svelte';
	import type { DropdownOption } from './MenuDropdown.svelte';

	type Props = {
		label: string;
		options: DropdownOption[];
		kind: 'radio' | 'checkbox';
		marked: boolean;
		onSelect: (value: string) => void;
	};
	const props: Props = $props();
</script>

<Menu onSelect={(d) => props.onSelect(d.value)} positioning={{ placement: 'right-start', offset: { mainAxis: 2 } }}>
	<Menu.TriggerItem value="more:{props.label}" class={menuItemClass}>
		<Menu.ItemText class="min-w-0 flex-1">{props.label}</Menu.ItemText><ChevronRight class="text-muted size-4 shrink-0" />
	</Menu.TriggerItem>
	<Portal>
		<Menu.Positioner>
			<Menu.Content class={menuContentClass}>
				{#each props.options as option (option.value)}
					<MenuDropdownOption {option} kind={props.kind} marked={props.marked} />
				{/each}
			</Menu.Content>
		</Menu.Positioner>
	</Portal>
</Menu>
