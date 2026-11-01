<script lang="ts">
	import { RotateCcw, RotateCw } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { m } from '$lib/paraglide/messages';

	type Props = { onturn: (dir: 'left' | 'right') => void; onreset: () => void; oncancel: () => void; ondone: () => void };
	const props: Props = $props();
</script>

<div class="card bg-surface-50-950 border-surface-200-800 flex items-center gap-1 border p-1 shadow-sm">
	<button
		type="button"
		class="btn-icon btn-icon-sm hover:preset-tonal"
		aria-label={m.image_crop_turn_left()}
		use:tip={m.image_crop_turn_left()}
		onclick={() => props.onturn('left')}
	>
		<RotateCcw size={16} />
	</button>
	<button
		type="button"
		class="btn-icon btn-icon-sm hover:preset-tonal"
		aria-label={m.image_crop_turn_right()}
		use:tip={m.image_crop_turn_right()}
		onclick={() => props.onturn('right')}
	>
		<RotateCw size={16} />
	</button>
	<button type="button" class="btn btn-sm hover:preset-tonal" onclick={props.onreset}>{m.image_crop_reset()}</button>
	<span class="grow"></span>
	<button type="button" class="btn btn-sm hover:preset-tonal" onclick={props.oncancel}>{m.image_crop_cancel()}</button>
	<button type="button" class="btn btn-sm preset-filled-primary-500" onclick={props.ondone}>{m.image_crop_done()}</button>
</div>
