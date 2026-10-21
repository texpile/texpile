<script lang="ts">
	type Props = { label: string; checked: boolean; onchange: (checked: boolean) => void };

	const props: Props = $props();
</script>

<button
	type="button"
	role="switch"
	aria-checked={props.checked}
	class="text-muted flex h-7 w-full items-center justify-between gap-2 text-left text-xs"
	onclick={() => props.onchange(!props.checked)}
>
	<span>{props.label}</span>
	<span class="relative h-4 w-7 shrink-0 rounded-full transition-colors {props.checked ? 'bg-primary-500' : 'bg-surface-300-700'}">
		<span class="bg-surface-50 absolute top-0.5 left-0.5 size-3 rounded-full transition-transform {props.checked ? 'translate-x-3' : ''}"
		></span>
	</span>
</button>
