<script lang="ts">
	import type { Component } from 'svelte';
	import { Check } from '@lucide/svelte';
	import { menuItemClass } from '$lib/menus/menuStyles';

	type Props = { icon: Component; open: boolean; label: string; onclick: () => void };
	const props: Props = $props();
	const Icon = $derived(props.icon);
</script>

<button class={menuItemClass} role="menuitemcheckbox" aria-checked={props.open} onclick={props.onclick}>
	<Icon class="size-4" />
	<span class="flex-1">{props.label}</span>
	<Check class="size-4 {props.open ? '' : 'invisible'}" />
</button>
