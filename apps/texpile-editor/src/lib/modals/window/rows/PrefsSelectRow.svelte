<script lang="ts">
	import type { PrefsRowId } from '../search/prefsRows';
	import PrefsRow from './PrefsRow.svelte';

	type Props = {
		id: PrefsRowId;
		value: string | number;
		options: { value: string | number; label: string }[];
		onChange: (value: string) => void;
		why?: string;
		/** when the row's label repeats another row's */
		ariaLabel?: string;
	};
	const props: Props = $props();
</script>

<PrefsRow id={props.id} why={props.why}>
	{#snippet children(def)}
		<select
			class="select w-auto min-w-32 text-sm"
			aria-label={props.ariaLabel ?? def.label()}
			value={props.value}
			disabled={!!props.why}
			onchange={(e) => props.onChange(e.currentTarget.value)}
		>
			{#each props.options as o (o.value)}
				<option value={o.value}>{o.label}</option>
			{/each}
		</select>
	{/snippet}
</PrefsRow>
