<script lang="ts">
	import type { Snippet } from 'svelte';
	import TuckedPanelTabs from '../../../chrome/TuckedPanelTabs.svelte';
	import { nextShapeStyle } from '../../../state/selection/selectionStyle';
	import { PointerReveal, pointerNearPanels } from '../../../state/pointerReveal.svelte';
	import { getFigureEditor } from '../../figureEditorContext.svelte';

	type Props = { children: Snippet };
	const props: Props = $props();
	const { editor } = getFigureEditor();
	const panes = $derived(editor.panes);
	const reveal = new PointerReveal(pointerNearPanels);
	const inUse = $derived(!!editor.selectedStatement || editor.tool === 'component' || !!nextShapeStyle(editor));
	const tucked = $derived(!inUse && !reveal.near && !reveal.focused);
</script>

<TuckedPanelTabs {editor} {tucked} />
<!-- 6.5rem clears the controls and notices at the foot of the stage -->
<div
	class="pointer-events-none absolute left-3 z-20 flex w-fit max-w-72 min-w-0 flex-col gap-2 transition-transform duration-160 ease-out motion-reduce:transition-none {tucked
		? 'translate-x-[calc(-100%-12px)]'
		: ''}"
	style:top="{panes.panelsTop}px"
	style:max-height="calc(100% - {panes.panelsTop}px - 6.5rem)"
	data-figure-panels
	{@attach reveal.attach}
>
	{@render props.children()}
</div>
