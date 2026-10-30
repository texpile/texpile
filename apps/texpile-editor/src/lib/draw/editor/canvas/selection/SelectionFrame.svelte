<script lang="ts">
	import type { CanvasGesture } from '../../state/gesture/canvasGesture.svelte';
	import type { FigureEditorState } from '../../state/editorState.svelte';
	import { isBareLine } from '../../state/gesture/canvasHits';
	import { isSizableNode } from '../../state/gesture/drags/nodeSizeDrag';
	import { cornerHandles, groupFrame, sideHandles, statementFrame } from './selectionFrames';

	const HANDLE_PX = 8;
	const EDGE_PX = 4;
	const GROUP_PAD_PX = 10;

	type Props = { editor: FigureEditorState; gesture: CanvasGesture };
	const props: Props = $props();

	// a line or rectangle already stretches by its own points; past two points the corners stretch it as a whole
	const stretchable = $derived(props.editor.handles.filter((h) => h.key[0] === 'p').length > 2);
	// lined up on a guide, the frame sits on the edge the guide is drawn on
	const lined = $derived(props.gesture.snap.guides.length > 0);
	// far enough out that a corner never sits on a point handle
	const padPx = $derived(lined ? 0 : stretchable ? 12 : 4);
	const frames = $derived(props.editor.selection.flatMap((i) => statementFrame(props.editor, props.gesture, i, padPx) ?? []));
	const hovered = $derived(
		props.editor.hovered && !props.editor.selection.includes(props.editor.hovered)
			? statementFrame(props.editor, props.gesture, props.editor.hovered, 2)
			: null
	);
	const scope = $derived(props.editor.selectedStatement?.kind === 'scope');
	// handles are for one shape at a time
	const box = $derived(frames.length === 1 && !scope ? frames[0] : null);
	const movable = $derived(!!props.editor.selectedInfo?.movable);
	// several shapes, or a scope, stretch together from the box around all of it
	const group = $derived(
		frames.length < 2 && !(scope && movable && frames.length)
			? null
			: groupFrame(frames, lined ? 0 : (GROUP_PAD_PX - padPx) / props.editor.viewport.scale)
	);
	// a locked shape keeps its box but nothing to take hold of
	const locked = $derived(props.editor.selection.some((i) => props.editor.flags.lockedAll.has(i)));
	// a node is sized rather than stretched: its text stays as it is
	const sized = $derived(!group && box && !stretchable && isSizableNode(props.editor));
	const handled = $derived(locked ? null : (group ?? (box && (stretchable || sized) ? box : null)));
	const key = $derived(group ? 'g' : sized ? 'n' : 's');
	const corners = $derived(handled ? cornerHandles(handled, key) : []);
	// the sides stretch along one axis when grabbed this near, as Excalidraw's do
	const sides = $derived(handled ? sideHandles(handled, key, EDGE_PX / props.editor.viewport.scale) : []);
	// a line from one point to another shows its ends alone, no box
	const bare = $derived(isBareLine(props.editor));
	const size = $derived(HANDLE_PX / props.editor.viewport.scale);
</script>

{#if hovered}
	<rect
		x={hovered.x}
		y={hovered.y}
		width={hovered.w}
		height={hovered.h}
		fill="none"
		stroke="var(--primary-ink)"
		stroke-width="1"
		vector-effect="non-scaling-stroke"
		pointer-events="none"
	/>
{/if}
<!-- a scope on its own has the box around all of it, which is the only one it needs -->
{#each (group && frames.length === 1) || bare ? [] : frames as frame (frame.i)}
	{@const isLocked = props.editor.flags.lockedAll.has(frame.i)}
	<g pointer-events="none">
		<rect
			x={frame.x}
			y={frame.y}
			width={frame.w}
			height={frame.h}
			fill="none"
			style:stroke={isLocked ? 'var(--color-surface-400-600)' : 'var(--primary-ink)'}
			stroke-width="1"
			stroke-dasharray={isLocked || (!movable && frames.length === 1) ? '4 3' : undefined}
			vector-effect="non-scaling-stroke"
		/>
	</g>
{/each}
{#each sides as s, n (n)}
	<rect data-handle={s.key} style:cursor={`${s.cursor}-resize`} x={s.x} y={s.y} width={s.w} height={s.h} fill="transparent" />
{/each}
{#if group}
	<rect
		x={group.x}
		y={group.y}
		width={group.w}
		height={group.h}
		fill="none"
		stroke="var(--primary-ink)"
		stroke-width="1"
		stroke-dasharray="4 3"
		vector-effect="non-scaling-stroke"
		pointer-events="none"
	/>
{/if}
{#each corners as c (c.key)}
	<rect
		data-handle={c.key}
		style:cursor={`${c.cursor}-resize`}
		x={c.at[0] - size / 2}
		y={c.at[1] - size / 2}
		width={size}
		height={size}
		rx={size / 4}
		fill="var(--color-surface-50-950)"
		stroke="var(--primary-ink)"
		stroke-width="1.5"
		vector-effect="non-scaling-stroke"
	/>
{/each}
