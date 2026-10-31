<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import Inspector from '../inspector/Inspector.svelte';
	import { arrangeActions } from '../objects/arrangeActions';
	import ObjectsPanel from '../objects/ObjectsPanel.svelte';
	import type { FigureEditorState } from '../state/editorState.svelte';
	import SidebarHeaderActions from './SidebarHeaderActions.svelte';

	type Props = { editor: FigureEditorState };
	const props: Props = $props();
	const panes = $derived(props.editor.panes);
</script>

<!-- the objects over the inspector, as the column was before; no border-l, the splitter beside it is the rule -->
<aside class="bg-surface-50-950 flex shrink-0 flex-col" style:width="{panes.sideWidth}px">
	<div class="flex min-h-0 flex-1 flex-col" bind:this={props.editor.panes.sideSplit}>
		{#if panes.objectsOpen}
			<div class="border-surface-200-800 flex h-9 shrink-0 items-center justify-between gap-2 border-b px-3">
				<span class="min-w-0 truncate text-sm font-semibold">{m.figure_objects()}</span>
				<SidebarHeaderActions actions={arrangeActions(props.editor)} width={panes.sideWidth} />
			</div>
			<ObjectsPanel editor={props.editor} />
		{/if}
		{#if panes.objectsOpen && panes.inspectorOpen}
			<!-- the WAI-ARIA window splitter; svelte's a11y rule does not know it -->
			<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
			<div
				class="hover:bg-primary-wash active:bg-primary-flood relative z-20 -my-[3px] h-1.5 shrink-0 cursor-row-resize bg-transparent transition-colors"
				onmousedown={panes.startInspectorResize}
				onkeydown={panes.resizeInspectorByKey}
				role="separator"
				aria-orientation="horizontal"
				aria-label={m.figure_sidebar_inspector_height()}
				tabindex="0"
			></div>
		{/if}
		{#if panes.inspectorOpen}<Inspector editor={props.editor} />{/if}
	</div>
</aside>
