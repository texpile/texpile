<script lang="ts">
	// Layout's whole-window zoom: out, the percentage (which resets it) and in
	import { Minus, Plus } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { settings } from '$lib/settings';
	import { keyLabel } from '$lib/keybindings/keybindings.svelte';
	import { uiZoomIn, uiZoomOut, uiZoomReset } from '$lib/workspace/shortcuts';
	import { m } from '$lib/paraglide/messages';

	const percent = $derived(Math.round((settings.current.uiZoom ?? 1) * 100));

	function hint(label: string, command: string): string {
		const key = keyLabel(command);
		return key ? `${label} (${key})` : label;
	}
</script>

<div class="flex items-center gap-0.5 pl-1">
	<button
		class="btn-icon btn-icon-sm hover:preset-tonal"
		aria-label={m.menubar_zoom_out()}
		use:tip={hint(m.menubar_zoom_out(), 'view.zoomOut')}
		onclick={uiZoomOut}
	>
		<Minus class="size-4" />
	</button>
	<button
		class="btn btn-sm hover:preset-tonal min-w-14 justify-start px-1 tabular-nums"
		aria-label={`${m.menubar_zoom_reset()} ${percent}%`}
		use:tip={hint(m.menubar_zoom_reset(), 'view.zoomReset')}
		onclick={uiZoomReset}
	>
		{percent}%
	</button>
	<button
		class="btn-icon btn-icon-sm hover:preset-tonal"
		aria-label={m.menubar_zoom_in()}
		use:tip={hint(m.menubar_zoom_in(), 'view.zoomIn')}
		onclick={uiZoomIn}
	>
		<Plus class="size-4" />
	</button>
</div>
