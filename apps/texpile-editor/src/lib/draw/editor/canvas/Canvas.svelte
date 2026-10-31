<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import type { CanvasGesture } from '../state/gesture/canvasGesture.svelte';
	import type { FigureEditorState } from '../state/editorState.svelte';
	import AttachTarget from '../connectors/AttachTarget.svelte';
	import ConnectDots from '../connectors/ConnectDots.svelte';
	import GridPlaces from '../diagrams/GridPlaces.svelte';
	import BranchDropTarget from '../trees/BranchDropTarget.svelte';
	import CanvasNotices from './notices/CanvasNotices.svelte';
	import StarterGrid from './starters/StarterGrid.svelte';
	import DragOverlay from './selection/DragOverlay.svelte';
	import DrawingLayer from './drawing/DrawingLayer.svelte';
	import PointHandles from './selection/PointHandles.svelte';
	import SelectionFrame from './selection/SelectionFrame.svelte';
	import RotateHandle from './selection/RotateHandle.svelte';
	import LockedHighlight from './locked/LockedHighlight.svelte';
	import UnlockPopup from './locked/UnlockPopup.svelte';
	import DimensionLines from './dimension/DimensionLines.svelte';
	import DimensionHint from './dimension/DimensionHint.svelte';
	import TrimPreview from './trim/TrimPreview.svelte';
	import TrimHint from './trim/TrimHint.svelte';
	import DrawPrompt from './notices/DrawPrompt.svelte';
	import DimensionValue from './dimension/DimensionValue.svelte';
	import DrawnDimensionFields from './dimension/DrawnDimensionFields.svelte';
	import DrawnDimensions from './dimension/DrawnDimensions.svelte';
	import NodeTextEditor from './text/NodeTextEditor.svelte';
	import SheetSizeLabel from './sheet/SheetSizeLabel.svelte';
	import SheetSizer from './sheet/SheetSizer.svelte';
	import ShapePreview from './ShapePreview.svelte';
	import Sheet from './sheet/Sheet.svelte';
	import { dropElement, ELEMENT_DRAG_TYPE } from '../library/libraryCommands';

	type Props = { editor: FigureEditorState; gesture: CanvasGesture };
	const props: Props = $props();
	const uid = $props.id();

	let surface = $state<HTMLDivElement>();

	function onpointerdown(e: PointerEvent) {
		// the notices' buttons and the dimension's field sit on the canvas; a press on one is theirs, not a gesture
		if ((e.target as Element).closest('button, input')) return;
		// no default focus move on mousedown: a new text node has just focused its field in the inspector
		e.preventDefault();
		surface?.focus();
		if (props.gesture.down(e, surface!)) surface!.setPointerCapture(e.pointerId);
	}

	const cursor = $derived(
		props.gesture.panning
			? 'cursor-grabbing'
			: props.gesture.spaceDown || props.editor.tool === 'hand'
				? 'cursor-grab'
				: props.editor.tool !== 'select'
					? 'cursor-crosshair'
					: props.gesture.hoverInBox
						? 'cursor-move'
						: ''
	);
</script>

<!-- the canvas is one focusable widget that takes its own pointer gestures; its keys are the editor's -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	bind:this={surface}
	bind:clientWidth={props.editor.viewport.width}
	bind:clientHeight={props.editor.viewport.height}
	class="relative min-h-0 flex-1 touch-none overflow-hidden bg-(--pdf-viewer-bg) outline-none {cursor}"
	role="application"
	aria-label={m.figure_canvas()}
	aria-busy={props.editor.render.busy}
	tabindex="0"
	{onpointerdown}
	onpointermove={(e) => props.gesture.move(e, surface!)}
	onpointerup={() => props.gesture.up()}
	onpointercancel={() => props.gesture.cancel()}
	onpointerleave={() => (props.gesture.pointer = null)}
	ondblclick={(e) => props.gesture.doubleClick(e, surface!)}
	ondragover={(e) => e.dataTransfer?.types.includes(ELEMENT_DRAG_TYPE) && e.preventDefault()}
	ondrop={(e) => dropElement(props.editor, e, surface!)}
	oncontextmenu={(e) => {
		e.preventDefault();
		props.gesture.contextMenu(e);
	}}
>
	<!-- the sheet waits for the engine's first drawing; the notices show the engine loading meanwhile -->
	{#if props.editor.render.drawing}
		<svg class="absolute inset-0 h-full w-full" viewBox={props.editor.viewport.viewBox} xmlns="http://www.w3.org/2000/svg">
			<g transform="scale(1 -1)">
				<Sheet editor={props.editor} />
				<DrawingLayer editor={props.editor} gesture={props.gesture} {uid} />
				<!-- the marks lie on the sheet, which is paper in either theme -->
				<g class="scheme-light">
					<SelectionFrame editor={props.editor} gesture={props.gesture} />
					<RotateHandle editor={props.editor} gesture={props.gesture} />
					<GridPlaces editor={props.editor} gesture={props.gesture} />
					<ConnectDots editor={props.editor} gesture={props.gesture} />
					<PointHandles editor={props.editor} gesture={props.gesture} />
					<SheetSizer editor={props.editor} gesture={props.gesture} />
					<ShapePreview editor={props.editor} gesture={props.gesture} />
					<DragOverlay gesture={props.gesture} />
					<DimensionLines editor={props.editor} />
					<TrimPreview editor={props.editor} />
					<DrawnDimensions editor={props.editor} gesture={props.gesture} />
					<AttachTarget editor={props.editor} gesture={props.gesture} />
					<BranchDropTarget editor={props.editor} gesture={props.gesture} />
					<LockedHighlight editor={props.editor} gesture={props.gesture} />
				</g>
			</g>
		</svg>
		<SheetSizeLabel editor={props.editor} gesture={props.gesture} />
		<UnlockPopup editor={props.editor} gesture={props.gesture} />
		<NodeTextEditor editor={props.editor} />
		<DimensionValue editor={props.editor} />
		<DrawnDimensionFields editor={props.editor} gesture={props.gesture} />
		<DimensionHint editor={props.editor} />
		<TrimHint editor={props.editor} />
		<DrawPrompt editor={props.editor} gesture={props.gesture} />
	{/if}
	<CanvasNotices editor={props.editor} />
	<StarterGrid editor={props.editor} />
</div>
