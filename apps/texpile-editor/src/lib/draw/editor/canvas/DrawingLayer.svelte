<script lang="ts">
	import DrawingDefs from './DrawingDefs.svelte';
	import { partsByStatement } from './drawingGroups';
	import type { CanvasGesture } from '../state/gesture/canvasGesture.svelte';
	import type { FigureEditorState } from '../state/editorState.svelte';

	type Props = { editor: FigureEditorState; gesture: CanvasGesture; uid: string };
	const props: Props = $props();

	const drawing = $derived(props.editor.render.drawing);
	const groups = $derived(partsByStatement(drawing?.parts ?? [], props.editor.flags.hiddenAll));
	function clipUrl(id: string | null) {
		return id ? `url(#${props.uid}-${id})` : undefined;
	}
	// a node or a plot's axis is a box you click into; any other outline is picked by its line
	function cursorOf(i: number) {
		return i && !props.editor.flags.lockedAll.has(i) && props.editor.tool === 'select' && !props.gesture.spaceDown ? 'cursor-move' : '';
	}
	const boxes = $derived(new Set(props.editor.picture?.statements.filter((s) => s.kind === 'node' || s.kind === 'axis').map((s) => s.i)));
</script>

{#if drawing}
	<DrawingDefs {drawing} uid={props.uid} />
	<!-- further out, as far as Excalidraw's reach, a line takes the click only where nothing else is drawn -->
	{#each groups as [i, parts] (i)}
		{@const offset = props.gesture.offset?.copy ? null : props.gesture.offsetOf(i)}
		{#if i && !boxes.has(i)}
			<g data-reach={i} class={cursorOf(i)} transform={offset ? `translate(${offset[0]} ${offset[1]})` : undefined}>
				{#each parts as p, n (n)}
					{#if p.kind === 'path' && p.stroke && !p.fill}
						<path d={p.d} fill="none" stroke="transparent" stroke-width="14" vector-effect="non-scaling-stroke" pointer-events="stroke" />
					{/if}
				{/each}
			</g>
		{/if}
	{/each}
	<!-- an isolated group, as pgf's blend group is: a blend mode mixes the picture's parts, not the sheet under them -->
	<g style:isolation="isolate">
		{#each groups as [i, parts] (i)}
			{@const offset = props.gesture.offsetOf(i)}
			{@const copying = !!offset && !!props.gesture.offset?.copy}
			<g
				id="{props.uid}-s{i}"
				data-stmt={i || undefined}
				transform={offset && !copying ? `translate(${offset[0]} ${offset[1]})` : undefined}
				class={cursorOf(i)}
			>
				{#each parts as p, n (n)}
					{#if p.kind === 'path'}
						<path
							d={p.d}
							fill={p.gradient ? `url(#${props.uid}-${p.gradient})` : (p.fill ?? 'none')}
							fill-opacity={p.fillOpacity < 1 ? p.fillOpacity : undefined}
							fill-rule={p.evenOdd ? 'evenodd' : undefined}
							stroke={p.stroke ?? undefined}
							stroke-width={p.stroke ? p.strokeWidth : undefined}
							stroke-opacity={p.strokeOpacity < 1 ? p.strokeOpacity : undefined}
							stroke-dasharray={p.dash ?? undefined}
							stroke-dashoffset={p.dashOffset || undefined}
							stroke-linecap={p.stroke ? p.cap : undefined}
							stroke-linejoin={p.stroke ? p.join : undefined}
							clip-path={clipUrl(p.clip)}
							style:mix-blend-mode={p.blend}
						/>
						{#if i && p.stroke && !p.fill}
							<!-- a hairline is hard to hit; an invisible copy takes the click near it, over what lies under it -->
							<path
								d={p.d}
								fill="transparent"
								stroke="transparent"
								stroke-width="7"
								vector-effect="non-scaling-stroke"
								pointer-events={boxes.has(i) ? 'all' : 'stroke'}
							/>
						{/if}
					{:else if p.kind === 'image'}
						{@const url = p.path.startsWith('data:') ? p.path : props.editor.render.imageUrl?.(p.path)}
						<!-- the clip is the picture's: on the element itself it would be moved by the element's own matrix -->
						<g clip-path={clipUrl(p.clip)}>
							{#if url}
								<image
									href={url}
									width="1"
									height="1"
									preserveAspectRatio="none"
									transform="matrix({p.matrix.join(' ')})"
									opacity={p.opacity < 1 ? p.opacity : undefined}
									style:mix-blend-mode={p.blend}
								/>
							{:else}
								<rect width="1" height="1" fill="var(--color-surface-200)" transform="matrix({p.matrix.join(' ')})" />
							{/if}
						</g>
					{:else}
						{@const font = props.editor.render.fonts.get(p.font)}
						{@const d = font ? props.editor.render.outline(font, p.code, p.gi) : null}
						{#if d}
							<g clip-path={clipUrl(p.clip)}>
								<path
									{d}
									transform="matrix({p.matrix.join(' ')})"
									fill={p.fill}
									fill-opacity={p.opacity < 1 ? p.opacity : undefined}
									style:mix-blend-mode={p.blend}
								/>
							</g>
						{/if}
					{/if}
				{/each}
			</g>
			{#if copying}
				<use href="#{props.uid}-s{i}" transform="translate({offset![0]} {offset![1]})" pointer-events="none" />
			{/if}
		{/each}
	</g>
{/if}
