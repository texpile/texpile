<script lang="ts">
	type Props = { label: string; active: boolean; onclick: () => void };
	const props: Props = $props();
</script>

<button
	class="rounded-base block w-full truncate py-1 pr-3 pl-6 text-left text-sm {props.active
		? 'bg-primary-tint font-medium'
		: 'text-muted hover:preset-tonal'}"
	aria-current={props.active ? 'location' : undefined}
	onclick={props.onclick}
>
	{props.label}
</button>
