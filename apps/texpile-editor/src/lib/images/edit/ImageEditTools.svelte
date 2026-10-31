<script lang="ts">
	import { Crop, FlipHorizontal2, FlipVertical2, Redo2, RotateCcw, RotateCw, Undo2 } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import type { ImageEditSession } from './imageEditSession.svelte';

	type Props = { session: ImageEditSession };
	const props: Props = $props();

	const session = $derived(props.session);
</script>

<button
	aria-pressed={session.cropping}
	onclick={() => (session.cropping ? session.finishCrop() : session.startCrop())}
	aria-label="Crop"
	use:tip={'Crop'}
>
	<Crop size={16} />
</button>
<button disabled={session.cropping} onclick={() => session.turn('left')} aria-label="Turn left" use:tip={'Turn left'}>
	<RotateCcw size={16} />
</button>
<button disabled={session.cropping} onclick={() => session.turn('right')} aria-label="Turn right" use:tip={'Turn right'}>
	<RotateCw size={16} />
</button>
<button disabled={session.cropping} onclick={() => session.flip('x')} aria-label="Flip horizontally" use:tip={'Flip horizontally'}>
	<FlipHorizontal2 size={16} />
</button>
<button disabled={session.cropping} onclick={() => session.flip('y')} aria-label="Flip vertically" use:tip={'Flip vertically'}>
	<FlipVertical2 size={16} />
</button>
<button disabled={session.cropping || !session.canUndo} onclick={() => session.undo()} aria-label="Undo" use:tip={'Undo'}>
	<Undo2 size={16} />
</button>
<button disabled={session.cropping || !session.canRedo} onclick={() => session.redo()} aria-label="Redo" use:tip={'Redo'}>
	<Redo2 size={16} />
</button>
