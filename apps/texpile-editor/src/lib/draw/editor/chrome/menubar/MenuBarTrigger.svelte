<script lang="ts">
	import { Menu } from '@skeletonlabs/skeleton-svelte';
	import { triggerClass } from '../../ui/menuStyles';

	type Props = { label: string };
	const props: Props = $props();
</script>

<Menu.Trigger class={triggerClass}>{props.label}</Menu.Trigger>
