<!-- A segmented switch for a light section: the hero's format switch with its tints turned from white to dark. -->
<script lang="ts" generics="K extends string">
	type SegmentSwitchProps = {
		label: string;
		options: readonly { key: K; label: string }[];
		current: K;
		onpick: (key: K) => void;
	};
	const props: SegmentSwitchProps = $props();
	const { label, options, current, onpick } = $derived(props);
</script>

<div role="group" aria-label={label} class="rounded-base bg-surface-950/[0.06] inline-flex p-0.5">
	{#each options as o (o.key)}
		<button
			type="button"
			aria-pressed={o.key === current}
			onclick={() => onpick(o.key)}
			class="rounded-base focus-visible:outline-primary-500 px-4 py-1 text-sm font-semibold outline-none focus-visible:outline-2 {o.key ===
			current
				? 'text-surface-950 bg-white shadow-sm'
				: 'text-surface-500 hover:text-surface-950'}"
		>
			{o.label}
		</button>
	{/each}
</div>
