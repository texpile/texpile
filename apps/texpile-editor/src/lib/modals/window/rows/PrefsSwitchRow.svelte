<script lang="ts">
	import { Switch } from '@skeletonlabs/skeleton-svelte';
	import type { PrefsRowId } from '../search/prefsRows';
	import PrefsRow from './PrefsRow.svelte';

	type Props = {
		id: PrefsRowId;
		checked: boolean;
		onChange: (on: boolean) => void;
		disabled?: boolean;
		why?: string;
		docs?: string;
	};
	const props: Props = $props();
</script>

<PrefsRow id={props.id} why={props.why} docs={props.docs}>
	{#snippet children(def)}
		<Switch checked={props.checked} disabled={props.disabled || !!props.why} onCheckedChange={(d) => props.onChange(d.checked)}>
			<Switch.Control><Switch.Thumb /></Switch.Control>
			<Switch.HiddenInput aria-label={def.label()} />
		</Switch>
	{/snippet}
</PrefsRow>
