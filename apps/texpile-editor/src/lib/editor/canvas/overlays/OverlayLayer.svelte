<script lang="ts">
	import type { OverlayHost } from './overlayHost.svelte';

	type OverlayLayerProps = { host: OverlayHost };

	const props: OverlayLayerProps = $props();
</script>

{#each props.host.placed as overlay (overlay.key)}
	{@const Overlay = overlay.spec.component}
	<div
		class="pointer-events-none absolute"
		data-overlay-key={overlay.spec.key}
		style:left="{overlay.left}px"
		style:top="{overlay.top}px"
		style:width="{overlay.width}px"
		style:height="{overlay.height}px"
	>
		<div
			class="pointer-events-auto"
			role="presentation"
			onpointerenter={() => props.host.hold(overlay.owner, true)}
			onpointerleave={() => props.host.hold(overlay.owner, false)}
		>
			<Overlay {...overlay.spec.props} />
		</div>
	</div>
{/each}
