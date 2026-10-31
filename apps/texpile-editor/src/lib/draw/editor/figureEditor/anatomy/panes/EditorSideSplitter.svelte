<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { ChevronLeft, ChevronRight } from '@lucide/svelte';
	import PaneSplitter from '$lib/components/PaneSplitter.svelte';
	import { getFigureEditor } from '../../figureEditorContext.svelte';

	const panes = getFigureEditor().editor.panes;
</script>

<PaneSplitter
	resizable
	resizeLabel={m.figure_sidebar_resize()}
	onStartResize={panes.startSideResize}
	onResizeByKey={panes.resizeSideByKey}
	toggle={{
		icon: panes.sideShown ? ChevronRight : ChevronLeft,
		onclick: panes.toggleSide,
		title: panes.sideShown ? m.figure_sidebar_hide() : m.figure_sidebar_show(),
		ariaLabel: m.figure_sidebar()
	}}
	class="z-30 {panes.sideShown ? '' : 'mr-[7px]'}"
/>
