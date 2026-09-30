<script lang="ts">
	// The notice that the preview is not showing the document's own colors. Always on screen while a
	// simulation is, so nobody mistakes a simulated palette for a broken one, and it carries the way back.
	import { Eye, X } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { colorVision, colorVisionLabel } from './colorVision';
	import { m } from '$lib/paraglide/messages';
</script>

<div class="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-3" role="status">
	<div
		class="bg-surface-50-950 border-surface-300-700 pointer-events-auto flex max-w-full items-center gap-2 rounded-container border py-1 pr-1 pl-2.5 text-sm shadow-sm"
	>
		<Eye class="text-warning-ink size-4 shrink-0" />
		<span class="cap-center truncate">{m.color_vision_badge({ mode: colorVisionLabel(colorVision.current) })}</span>
		<button
			class="btn-icon btn-icon-sm hover:preset-tonal shrink-0"
			onclick={() => (colorVision.current = 'none')}
			use:tip={m.color_vision_off()}
			aria-label={m.color_vision_off()}
		>
			<X class="size-4" />
		</button>
	</div>
</div>
