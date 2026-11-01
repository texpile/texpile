<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { FIELD_LABEL, NUMBER_AFFIX, NUMBER_BOX, NUMBER_INPUT } from '../../ui/panelStyles';
	import { formatNumber } from '../../figure/numbers';
	import { readNumber } from './numberFieldUtils';

	const SPOKEN: Record<string, () => string> = { w: () => m.figure_width(), h: () => m.figure_height() };

	type Props = {
		label: string;
		names?: [string, string];
		unit?: string;
		values: [number | null, number | null];
		clearable?: boolean;
		signed?: boolean;
		oncommit: (k: 0 | 1, value: number | null) => void;
	};
	const props: Props = $props();
	const names = $derived(props.names ?? ['w', 'h']);
	const unit = $derived(props.unit ?? 'cm');
	const clearable = $derived(props.clearable ?? false);
	const signed = $derived(props.signed ?? false);

	function shown(k: 0 | 1) {
		return props.values[k] === null ? '' : formatNumber(props.values[k]!);
	}

	let putBack = $state(0);

	function commit(k: 0 | 1, text: string) {
		const v = readNumber(text);
		if (!text.trim() && clearable && props.values[k] !== null) props.oncommit(k, null);
		else if (v !== null && (signed || v > 0) && v !== props.values[k]) props.oncommit(k, v);
		else putBack++;
	}
</script>

<div class="px-3 pt-3">
	<div class="{FIELD_LABEL} flex justify-between"><span>{props.label}</span><span class="font-normal">{unit}</span></div>
	<div class="grid grid-cols-2 gap-1.5">
		{#each [0, 1] as const as k (k)}
			<label class={NUMBER_BOX}>
				<span class="{NUMBER_AFFIX} pr-0">{names[k]}</span>
				{#key putBack}
					<input
						class={NUMBER_INPUT}
						value={shown(k)}
						placeholder={m.figure_auto()}
						aria-label="{props.label} {SPOKEN[names[k]]?.() ?? names[k]}"
						onchange={(e) => commit(k, e.currentTarget.value)}
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
