<script lang="ts">
	// a divider between editor slots: between the columns or between the rows, dragged to move it,
	// double-clicked to even both sides
	import { untrack } from 'svelte';
	import { editorGroups } from '$lib/workspace/groups/editorGroups.svelte';
	import { movedDivider } from '$lib/workspace/groups/groupSizes';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		axis: 'column' | 'row';
		/** the two tracks it sits between, in pixels as drawn */
		sizes: number[];
		least: number;
		style: string;
	};
	const props: Props = $props();
	const across = $derived(props.axis === 'column');

	function moveBy(from: number[], delta: number): void {
		const [a, b] = movedDivider(from, 0, delta, props.least);
		if (a + b > 0) editorGroups.resizeSplit(props.axis, a / (a + b));
	}

	// one handle with a split preview's divider beside it: hovering or dragging either lights both
	const lit = $derived(across ? null : editorGroups.rowDivider);
	function hover(on: boolean): void {
		if (!across && editorGroups.rowDivider !== 'drag') editorGroups.rowDivider = on ? 'hover' : 'idle';
	}

	function onPointerDown(event: PointerEvent) {
		if (event.button !== 0) return;
		event.preventDefault();
		const handle = event.currentTarget as HTMLElement;
		handle.setPointerCapture(event.pointerId);
		if (!across) editorGroups.rowDivider = 'drag';
		const start = across ? event.clientX : event.clientY;
		const from = props.sizes;
		function move(e: PointerEvent): void {
			moveBy(from, (across ? e.clientX : e.clientY) - start);
		}
		// capture goes on release and on a cancelled pointer alike: either ends the drag
		function up(): void {
			if (!across) editorGroups.rowDivider = 'idle';
			handle.removeEventListener('pointermove', move);
			handle.removeEventListener('lostpointercapture', up);
		}
		handle.addEventListener('pointermove', move);
		handle.addEventListener('lostpointercapture', up);
	}
	// a divider that goes while lit (the layout shrank under it) takes its light with it
	$effect(() => () => {
		if (!across) untrack(() => (editorGroups.rowDivider = 'idle'));
	});

	function onKeyDown(event: KeyboardEvent) {
		const back = across ? 'ArrowLeft' : 'ArrowUp';
		const on = across ? 'ArrowRight' : 'ArrowDown';
		const step = event.key === back ? -16 : event.key === on ? 16 : 0;
		if (!step) return;
		event.preventDefault();
		moveBy(props.sizes, step);
	}
</script>

<div class="border-surface-200-800 relative z-30 {across ? 'border-l' : 'border-t'}" style={props.style}>
	<!-- a focusable separator is the ARIA pattern for a splitter; svelte counts it as non-interactive -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
	<div
		class="hover:bg-primary-wash active:bg-primary-flood absolute transition-colors {across
			? 'inset-y-0 -left-[3px] w-[7px] cursor-col-resize'
			: 'inset-x-0 -top-[3px] h-[7px] cursor-row-resize'} {lit === 'drag' ? 'bg-primary-flood' : lit === 'hover' ? 'bg-primary-wash' : ''}"
		onpointerenter={() => hover(true)}
		onpointerleave={() => hover(false)}
		role="separator"
		aria-orientation={across ? 'vertical' : 'horizontal'}
		aria-label={m.groups_resize_aria()}
		tabindex="0"
		onpointerdown={onPointerDown}
		ondblclick={() => editorGroups.resizeSplit(props.axis, 0.5)}
		onkeydown={onKeyDown}
	></div>
	{#if !across}
		<!-- the lower editors' tab strip reads as part of the divider, so its bottom edge drags it too -->
		<div
			class="hover:bg-primary-wash active:bg-primary-flood absolute inset-x-0 top-[33px] h-[7px] cursor-row-resize transition-colors {lit ===
			'drag'
				? 'bg-primary-flood'
				: lit === 'hover'
					? 'bg-primary-wash'
					: ''}"
			onpointerenter={() => hover(true)}
			onpointerleave={() => hover(false)}
			onpointerdown={onPointerDown}
			ondblclick={() => editorGroups.resizeSplit(props.axis, 0.5)}
			aria-hidden="true"
		></div>
	{/if}
</div>
