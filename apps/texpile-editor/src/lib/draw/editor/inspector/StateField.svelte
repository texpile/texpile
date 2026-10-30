<script lang="ts">
	import { FIELD_LABEL, SWITCH_ROW, switchThumb, switchTrack } from '../ui/panelStyles';
	type Props = { initial: boolean; accepting: boolean; onchange: (change: { initial?: boolean; accepting?: boolean }) => void };
	const props: Props = $props();
</script>

<!-- two marks a state can carry, each on or off by itself -->
<div class="px-3 pt-2.5" role="group" aria-label="State">
	<div class={FIELD_LABEL}>State</div>
	{#each [['Start', props.initial, { initial: !props.initial }], ['Accepting', props.accepting, { accepting: !props.accepting }]] as const as [name, on, change] (name)}
		<button class={SWITCH_ROW} role="switch" aria-checked={on} onclick={() => props.onchange(change)}>
			<span>{name}</span>
			<span class={switchTrack(on)}><span class={switchThumb(on)}></span></span>
		</button>
	{/each}
</div>
