<script lang="ts">
	import { ChevronLeft, ChevronRight } from '@lucide/svelte';
	import PaneSplitter from '../../../ui/PaneSplitter.svelte';
	import { getFigureEditor } from '../../figureEditorContext.svelte';

	const panes = getFigureEditor().editor.panes;
</script>

<PaneSplitter
	resizable={panes.codeOpen}
	resizeLabel="Code pane width"
	onStartResize={panes.startCodeResize}
	onResizeByKey={panes.resizeCodeByKey}
	onReset={panes.resetCodeWidth}
	toggle={{
		icon: panes.codeOpen ? ChevronLeft : ChevronRight,
		onclick: panes.toggleCode,
		title: panes.codeOpen ? 'Hide the code' : 'Show the code',
		ariaLabel: 'Code'
	}}
	class="z-30 {panes.codeOpen ? '' : 'ml-[7px]'}"
/>
