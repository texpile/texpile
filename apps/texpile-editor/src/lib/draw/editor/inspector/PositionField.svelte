<script lang="ts">
	import { FIELD_LABEL, NUMBER_AFFIX, NUMBER_BOX, NUMBER_INPUT } from '../ui/panelStyles';
	import { formatNumber } from '../figure/numbers';
	import { readNumber } from './fields/numberFieldUtils';

	// the statement's first plain point; changing it moves the whole statement by the difference
	type Props = { x: number; y: number; onmove: (du: number, dv: number) => void };
	const props: Props = $props();

	// a value it cannot take, or Escape, puts back the one it has
	let putBack = $state(0);

	function commit(axis: 'x' | 'y', text: string) {
		const v = readNumber(text);
		const was = axis === 'x' ? props.x : props.y;
		if (v === null || v === was) putBack++;
		else if (axis === 'x') props.onmove(v - was, 0);
		else props.onmove(0, v - was);
	}
</script>

<div class="px-3 pt-2.5">
	<div class="{FIELD_LABEL} flex justify-between"><span>Position</span><span class="font-normal">cm</span></div>
	<div class="grid grid-cols-2 gap-1.5">
		{#each [['x', props.x], ['y', props.y]] as const as [axis, v] (axis)}
			<label class={NUMBER_BOX}>
				<span class="{NUMBER_AFFIX} pr-0">{axis}</span>
				{#key putBack}
					<input
						class={NUMBER_INPUT}
						value={formatNumber(v)}
						onchange={(e) => commit(axis, e.currentTarget.value)}
						onkeydown={(e) => {
							if (e.key === 'Enter') e.currentTarget.blur();
							if (e.key === 'Escape') putBack++;
						}}
					/>
				{/key}
			</label>
		{/each}
	</div>
</div>
