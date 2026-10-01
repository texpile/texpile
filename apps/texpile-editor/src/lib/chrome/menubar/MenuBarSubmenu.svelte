<script lang="ts">
	// a row that opens its own panel of items inside a menu bar menu
	import type { Snippet } from 'svelte';
	import { Menu, Portal } from '@skeletonlabs/skeleton-svelte';
	import { ChevronRight } from '@lucide/svelte';
	import { menuContentClass, menuBarItemClass } from '$lib/menus/menuStyles';

	type Props = {
		value: string;
		label: string;
		select: (value: string) => void;
		children: Snippet;
	};

	const props: Props = $props();
</script>

<Menu onSelect={(d) => props.select(d.value)}>
	<Menu.TriggerItem value={props.value} class={menuBarItemClass}>
		<Menu.ItemText>{props.label}</Menu.ItemText><ChevronRight class="size-4 opacity-60" />
	</Menu.TriggerItem>
	<Portal>
		<Menu.Positioner>
			<Menu.Content class={menuContentClass}>
				{@render props.children()}
			</Menu.Content>
		</Menu.Positioner>
	</Portal>
</Menu>
