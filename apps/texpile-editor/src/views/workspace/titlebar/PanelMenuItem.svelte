<script lang="ts">
	import type { Component } from 'svelte';
	import { Check } from '@lucide/svelte';
	import { menuItemClass } from '$lib/menus/menuStyles';
	import { unavailableTip } from '$lib/components/tooltip.svelte';

	// `unavailable`: the reason, on a grayed row; aria-disabled because a disabled button takes no hover to show it
	type Props = { icon: Component; open: boolean; label: string; onclick: () => void; unavailable?: string };
	const props: Props = $props();
	const Icon = $derived(props.icon);
</script>

<button
	class="{menuItemClass} data-[disabled]:cursor-default"
	role="menuitemcheckbox"
	aria-checked={props.open}
	aria-disabled={!!props.unavailable}
	data-disabled={props.unavailable ? '' : undefined}
	use:unavailableTip={props.unavailable}
	onclick={() => !props.unavailable && props.onclick()}
>
	<Icon class="size-4" />
	<span class="flex-1 whitespace-nowrap">{props.label}</span>
	<Check class="size-4 {props.open ? '' : 'invisible'}" />
</button>
