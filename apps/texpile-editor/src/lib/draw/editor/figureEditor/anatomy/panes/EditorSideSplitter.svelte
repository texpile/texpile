<script lang="ts">
	import { ChevronLeft, ChevronRight } from '@lucide/svelte';
	import PaneSplitter from '$lib/components/PaneSplitter.svelte';
	import { getFigureEditor } from '../../figureEditorContext.svelte';

	const panes = getFigureEditor().editor.panes;
</script>

<PaneSplitter
	resizable
	resizeLabel="Objects and inspector width"
	onStartResize={panes.startSideResize}
	onResizeByKey={panes.resizeSideByKey}
	toggle={{
		icon: panes.sideShown ? ChevronRight : ChevronLeft,
		onclick: panes.toggleSide,
		title: panes.sideShown ? 'Hide the objects and the inspector' : 'Show the objects and the inspector',
		ariaLabel: 'Objects and inspector'
	}}
	class="z-30 {panes.sideShown ? '' : 'mr-[7px]'}"
/>
