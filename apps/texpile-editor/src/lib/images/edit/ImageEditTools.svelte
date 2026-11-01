<script lang="ts">
	import { m } from '$lib/paraglide/messages';
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
	aria-label={m.imageoverlay_crop()}
	use:tip={m.imageoverlay_crop()}
>
	<Crop size={16} />
</button>
<button
	disabled={session.cropping}
	onclick={() => session.turn('left')}
	aria-label={m.image_crop_turn_left()}
	use:tip={m.image_crop_turn_left()}
>
	<RotateCcw size={16} />
</button>
<button
	disabled={session.cropping}
	onclick={() => session.turn('right')}
	aria-label={m.image_crop_turn_right()}
	use:tip={m.image_crop_turn_right()}
>
	<RotateCw size={16} />
</button>
<button
	disabled={session.cropping}
	onclick={() => session.flip('x')}
	aria-label={m.image_flip_horizontal()}
	use:tip={m.image_flip_horizontal()}
>
	<FlipHorizontal2 size={16} />
</button>
<button
	disabled={session.cropping}
	onclick={() => session.flip('y')}
	aria-label={m.image_flip_vertical()}
	use:tip={m.image_flip_vertical()}
>
	<FlipVertical2 size={16} />
</button>
<button
	disabled={session.cropping || !session.canUndo}
	onclick={() => session.undo()}
	aria-label={m.menubar_undo()}
	use:tip={m.menubar_undo()}
>
	<Undo2 size={16} />
</button>
<button
	disabled={session.cropping || !session.canRedo}
	onclick={() => session.redo()}
	aria-label={m.menubar_redo()}
	use:tip={m.menubar_redo()}
>
	<Redo2 size={16} />
</button>
