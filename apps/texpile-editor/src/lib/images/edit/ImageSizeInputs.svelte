<script lang="ts">
	// the image's size, either side typed to shrink it; the other follows its proportions
	import { tip } from '$lib/components/tooltip.svelte';
	import type { ImageEditSession } from './imageEditSession.svelte';

	type Props = { session: ImageEditSession };
	const props: Props = $props();

	function setSide(e: Event, side: 'w' | 'h'): void {
		const input = e.target as HTMLInputElement;
		const value = Number(input.value);
		if (side === 'w') props.session.setWidth(value > 0 ? value : null);
		else props.session.setHeight(value > 0 ? value : null);
		// a size larger than the image changes nothing, so the box shows the size it still is
		input.value = String(props.session.output[side]);
	}
</script>

<input
	type="number"
	class="page-input"
	min="1"
	value={props.session.output.w}
	disabled={props.session.cropping}
	onchange={(e) => setSide(e, 'w')}
	aria-label="Width in pixels"
	use:tip={'Width in pixels'}
	style:--digits={String(props.session.output.w).length}
/>
<span class="text-muted text-xs">×</span>
<input
	type="number"
	class="page-input"
	min="1"
	value={props.session.output.h}
	disabled={props.session.cropping}
	onchange={(e) => setSide(e, 'h')}
	aria-label="Height in pixels"
	use:tip={'Height in pixels'}
	style:--digits={String(props.session.output.h).length}
/>
<span class="text-muted text-xs">px</span>
