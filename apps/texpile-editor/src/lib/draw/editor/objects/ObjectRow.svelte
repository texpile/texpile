<script lang="ts">
	import {
		Braces,
		ChartScatter,
		ChartSpline,
		ChevronDown,
		ChevronRight,
		Circle,
		CircleAlert,
		CircleDot,
		Crosshair,
		Eye,
		EyeOff,
		Folder,
		Grid3x3,
		Lock,
		LockOpen,
		MoveUpRight,
		Pencil,
		Pentagon,
		RectangleHorizontal,
		Repeat,
		RulerDimensionLine,
		Slash,
		Spline,
		Square,
		SquareDot,
		Type,
		Waypoints
	} from '@lucide/svelte';
	import type { Component } from 'svelte';
	import type { FigureEditorState } from '../state/editorState.svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { toggleLocked } from './lockCommands';
	import type { ObjectListRow } from './objectRows';
	import type { ObjectsDrag } from './objectsDrag.svelte';

	const ICONS: Record<string, Component<{ size?: number }>> = {
		Rectangle: Square,
		Circle,
		Ellipse: Circle,
		Freehand: Pencil,
		Curve: Spline,
		Arc: Spline,
		Grid: Grid3x3,
		Polygon: Pentagon,
		Arrow: MoveUpRight,
		Line: Slash,
		Text: Type,
		Box: RectangleHorizontal,
		State: CircleDot,
		Cell: SquareDot,
		Branch: Waypoints,
		Axis: ChartSpline,
		Plot: ChartSpline,
		Points: ChartScatter,
		Scope: Folder,
		Loop: Repeat,
		Coordinate: Crosshair,
		Dimension: RulerDimensionLine
	};
	// Texpile's file tree: a row action, its icon a share of the text until the pointer is on it
	const FLAG = 'btn-icon btn-icon-xs text-muted hover:text-surface-950-50 transition-opacity';

	type Props = {
		editor: FigureEditorState;
		row: ObjectListRow;
		drag: ObjectsDrag;
		foldable: boolean;
		renaming: boolean;
		onpick: (e: MouseEvent) => void;
		onstartrename: () => void;
		/** null when the rename was given up */
		onrename: (label: string | null) => void;
		ontoggle: () => void;
	};
	const props: Props = $props();

	const Icon = $derived(ICONS[props.row.title] ?? Braces);
	const i = $derived(props.row.st.i);
	const over = $derived(props.drag.over?.i === i ? props.drag.over.place : null);
	// Texpile's file tree: the row the inspector shows is tinted, and inked while the list has the keys
	const selectionClass = $derived(
		props.editor.selected === i
			? 'bg-primary-tint group-focus-within/tree:text-primary-ink font-medium'
			: props.row.selected
				? 'bg-surface-strong-wash'
				: 'hover:preset-tonal'
	);

	function revealSelected(el: HTMLElement) {
		if (props.row.selected) el.scrollIntoView({ block: 'nearest' });
	}

	function focusAndSelect(el: HTMLInputElement) {
		el.focus();
		el.select();
	}
</script>

<!-- keys go to the tree around the rows -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
	role="treeitem"
	aria-selected={props.row.selected}
	aria-level={props.row.depth + 1}
	aria-expanded={props.row.scope ? props.row.open : undefined}
	tabindex="-1"
	draggable={!props.renaming}
	data-object={i}
	class="group rounded-base relative flex cursor-default items-center gap-1 py-0.5 pr-1 text-sm transition-colors select-none {selectionClass} {over ===
	'into'
		? 'ring-primary-500 ring-2 ring-inset'
		: ''}"
	style:padding-left="{4 + props.row.depth * 12}px"
	onclick={props.onpick}
	oncontextmenu={(e) => {
		e.preventDefault();
		if (!props.row.selected) props.editor.select(i);
		props.editor.contextMenuAt = { x: e.clientX, y: e.clientY };
	}}
	ondblclick={props.onstartrename}
	onpointerenter={() => (props.editor.hovered = i)}
	onpointerleave={() => props.editor.hovered === i && (props.editor.hovered = 0)}
	ondragstart={(e) => props.drag.start(e, i)}
	ondragover={(e) => props.drag.move(e, props.row)}
	ondragleave={() => props.drag.over?.i === i && (props.drag.over = null)}
	ondrop={(e) => props.drag.drop(e)}
	ondragend={() => props.drag.end()}
	{@attach revealSelected}
>
	{#if over === 'before' || over === 'after'}
		<span class="bg-primary-ink pointer-events-none absolute right-0 left-0 h-0.5 {over === 'before' ? 'top-0' : 'bottom-0'}"></span>
	{/if}
	{#if props.row.scope}
		<button
			class="text-faint flex w-3.5 shrink-0 justify-center"
			aria-label={props.row.open ? 'Collapse' : 'Expand'}
			onclick={(e) => {
				e.stopPropagation();
				props.ontoggle();
			}}
			>{#if props.row.open}<ChevronDown class="size-3.5" />{:else}<ChevronRight class="size-3.5" />{/if}</button
		>
	{:else if props.foldable}
		<span class="w-3.5 shrink-0"></span>
	{/if}
	{#if props.row.failed}
		<span class="text-error-ink shrink-0" use:tip={`${props.editor.language.engineName} could not draw this`}
			><CircleAlert class="size-4" /></span
		>
	{:else}
		<span class="shrink-0 {props.row.selected ? '' : 'text-muted'} {props.row.hidden || props.row.inherited ? 'opacity-50' : ''}"
			><Icon size={16} /></span
		>
	{/if}
	{#if props.renaming}
		<input
			class="input h-6 min-w-0 flex-1 py-0 text-sm"
			value={props.editor.language.readLabel(props.editor.source, props.row.st) ?? ''}
			placeholder={props.row.name}
			aria-label="Name"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => {
				e.stopPropagation();
				if (e.key === 'Enter') props.onrename(e.currentTarget.value);
				if (e.key === 'Escape') props.onrename(null);
			}}
			onblur={(e) => props.onrename(e.currentTarget.value)}
			{@attach focusAndSelect}
		/>
	{:else}
		<span class="cap-center min-w-0 flex-1 truncate {props.row.hidden || props.row.inherited ? 'text-faint' : ''}">{props.row.name}</span>
	{/if}
	<button
		class="{FLAG} {props.row.locked ? '' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}"
		aria-pressed={props.row.locked}
		onclick={(e) => {
			e.stopPropagation();
			toggleLocked(props.editor, [i]);
		}}
		use:tip={props.row.locked ? 'Unlock on the canvas' : 'Lock on the canvas'}
		>{#if props.row.locked}<Lock class="size-3.5" />{:else}<LockOpen class="size-3.5" />{/if}</button
	>
	<button
		class="{FLAG} {props.row.hidden ? '' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}"
		aria-pressed={props.row.hidden}
		onclick={(e) => {
			e.stopPropagation();
			props.editor.flags.toggle('hidden', i);
		}}
		use:tip={props.row.hidden ? 'Show on the canvas' : 'Hide on the canvas'}
		>{#if props.row.hidden}<EyeOff class="size-3.5" />{:else}<Eye class="size-3.5" />{/if}</button
	>
</div>
