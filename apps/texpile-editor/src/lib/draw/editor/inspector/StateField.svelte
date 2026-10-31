<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { FIELD_LABEL, SWITCH_ROW, switchThumb, switchTrack } from '../ui/panelStyles';
	type Props = { initial: boolean; accepting: boolean; onchange: (change: { initial?: boolean; accepting?: boolean }) => void };
	const props: Props = $props();
</script>

<!-- two marks a state can carry, each on or off by itself -->
<div class="px-3 pt-2.5" role="group" aria-label={m.figure_state()}>
	<div class={FIELD_LABEL}>{m.figure_state()}</div>
	{#each [[m.figure_state_start(), props.initial, { initial: !props.initial }], [m.figure_state_accepting(), props.accepting, { accepting: !props.accepting }]] as const as [name, on, change] (name)}
		<button class={SWITCH_ROW} role="switch" aria-checked={on} onclick={() => props.onchange(change)}>
			<span>{name}</span>
			<span class={switchTrack(on)}><span class={switchThumb(on)}></span></span>
		</button>
	{/each}
</div>
