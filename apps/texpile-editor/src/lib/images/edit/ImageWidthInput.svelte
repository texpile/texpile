<script lang="ts">
	import { tip } from '$lib/components/tooltip.svelte';
	import type { ImageEditSession } from './imageEditSession.svelte';

	type Props = { session: ImageEditSession };
	const props: Props = $props();

	function setWidth(e: Event): void {
		const value = Number((e.target as HTMLInputElement).value);
		props.session.setWidth(value > 0 ? value : null);
	}
</script>

<input
	type="number"
	class="page-input"
	min="1"
	value={props.session.output.w}
	disabled={props.session.cropping}
	onchange={setWidth}
	aria-label="Width in pixels"
	use:tip={'Width in pixels'}
	style:--digits={String(props.session.output.w).length}
/>
<span class="text-muted text-xs tabular-nums">× {props.session.output.h} px</span>
