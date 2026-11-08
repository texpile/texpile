<script lang="ts">
	import { Slider } from '@skeletonlabs/skeleton-svelte';
	import type { PrefsRowId } from '../search/prefsRows';
	import PrefsRow from './PrefsRow.svelte';

	type Props = {
		id: PrefsRowId;
		value: string;
		/** from least to most */
		stops: { value: string; label: string }[];
		onChange: (value: string) => void;
	};
	const props: Props = $props();
	const at = $derived(
		Math.max(
			0,
			props.stops.findIndex((s) => s.value === props.value)
		)
	);
</script>

<PrefsRow id={props.id}>
	{#snippet children(def)}
		<div class="flex w-52 flex-col gap-1.5">
			<Slider
				value={[at]}
				min={0}
				max={props.stops.length - 1}
				step={1}
				aria-label={[def.label()]}
				getAriaValueText={(d) => props.stops[d.value]?.label ?? ''}
				onValueChange={(d) => props.onChange(props.stops[d.value[0]].value)}
			>
				<Slider.Control>
					<Slider.Track><Slider.Range /></Slider.Track>
					<Slider.Thumb index={0}><Slider.HiddenInput /></Slider.Thumb>
				</Slider.Control>
			</Slider>
			<span class="text-muted text-right text-xs">{props.stops[at].label}</span>
		</div>
	{/snippet}
</PrefsRow>
