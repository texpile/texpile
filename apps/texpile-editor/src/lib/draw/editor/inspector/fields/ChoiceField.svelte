<script lang="ts">
	import { FIELD_LABEL, SEGMENTS, segmentClass } from '../../ui/panelStyles';
	type Props = {
		label: string;
		options: readonly { value: string; label: string }[];
		value: string | null;
		disabled?: boolean;
		/** wraps into rows this many wide */
		columns?: number;
		onpick: (value: string) => void;
	};
	const props: Props = $props();
	const disabled = $derived(props.disabled ?? false);
	// a short last row is filled out, so every row has its lines
	const fillers = $derived(props.columns ? (props.columns - (props.options.length % props.columns)) % props.columns : 0);
</script>

<div class="px-3 pt-2.5">
	<div class={FIELD_LABEL}>{props.label}</div>
	{#if props.columns}
		<!-- the lines between rows are the gaps, so none goes missing where rows and columns meet -->
		<div
			class="border-surface-300-700 rounded-base bg-surface-300-700 grid gap-px overflow-hidden border"
			style:grid-template-columns="repeat({props.columns}, minmax(0, 1fr))"
			role="group"
			aria-label={props.label}
		>
			{#each props.options as o (o.value)}
				<button
					class="h-7 min-w-0 truncate px-1.5 text-xs {props.value === o.value
						? 'bg-primary-tint-solid text-primary-ink'
						: 'bg-surface-50-950 text-surface-700-300 hover:bg-surface-100-900'}"
					aria-pressed={props.value === o.value}
					{disabled}
					onclick={() => props.onpick(o.value)}>{o.label}</button
				>
			{/each}
			{#each { length: fillers }, n (n)}<span class="bg-surface-50-950"></span>{/each}
		</div>
	{:else}
		<div class={SEGMENTS} role="group" aria-label={props.label}>
			{#each props.options as o (o.value)}
				<button
					class={segmentClass(props.value === o.value)}
					aria-pressed={props.value === o.value}
					{disabled}
					onclick={() => props.onpick(o.value)}>{o.label}</button
				>
			{/each}
		</div>
	{/if}
</div>
