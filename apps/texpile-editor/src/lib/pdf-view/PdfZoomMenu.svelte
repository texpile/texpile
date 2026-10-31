<script lang="ts">
	import { MoveHorizontal, Maximize } from '@lucide/svelte';
	import { getPdfViewerContext } from './pdf-viewer/context';
	import ZoomMenu from '$lib/preview/zoom/ZoomMenu.svelte';

	const ctx = getPdfViewerContext();
</script>

<ZoomMenu
	scale={ctx.state.scale}
	fits={[
		{ label: 'Fit width', icon: MoveHorizontal, run: ctx.actions.fitWidth },
		{ label: 'Fit page', icon: Maximize, run: ctx.actions.fitPage }
	]}
	onscale={(scale) => ctx.actions.setScale(scale)}
/>
