<script lang="ts">
	import { RotateCcw, RotateCw } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';

	type Props = { onturn: (dir: 'left' | 'right') => void; onreset: () => void; oncancel: () => void; ondone: () => void };
	const props: Props = $props();
</script>

<div class="card bg-surface-50-950 border-surface-200-800 flex items-center gap-1 border p-1 shadow-sm">
	<button
		type="button"
		class="btn-icon btn-icon-sm hover:preset-tonal"
		aria-label="Turn left"
		use:tip={'Turn left'}
		onclick={() => props.onturn('left')}
	>
		<RotateCcw size={16} />
	</button>
	<button
		type="button"
		class="btn-icon btn-icon-sm hover:preset-tonal"
		aria-label="Turn right"
		use:tip={'Turn right'}
		onclick={() => props.onturn('right')}
	>
		<RotateCw size={16} />
	</button>
	<button type="button" class="btn btn-sm hover:preset-tonal" onclick={props.onreset}>Reset</button>
	<span class="grow"></span>
	<button type="button" class="btn btn-sm hover:preset-tonal" onclick={props.oncancel}>Cancel</button>
	<button type="button" class="btn btn-sm preset-filled-primary-500" onclick={props.ondone}>Done</button>
</div>
