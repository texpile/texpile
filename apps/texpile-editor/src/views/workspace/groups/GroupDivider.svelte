<script lang="ts">
	// the divider between two editor groups: dragged to move it, double-clicked to make every group the same width
	import { editorGroups } from '$lib/workspace/groups/editorGroups.svelte';
	import { m } from '$lib/paraglide/messages';

	type Props = { index: number; rowWidth: number };
	const props: Props = $props();

	function onPointerDown(event: PointerEvent) {
		if (event.button !== 0) return;
		event.preventDefault();
		const handle = event.currentTarget as HTMLElement;
		handle.setPointerCapture(event.pointerId);
		let last = event.clientX;
		function move(e: PointerEvent): void {
			const total = editorGroups.list.reduce((sum, g) => sum + g.share, 0);
			if (props.rowWidth > 0) editorGroups.resize(props.index, ((e.clientX - last) / props.rowWidth) * total);
			last = e.clientX;
		}
		function up(): void {
			handle.removeEventListener('pointermove', move);
			handle.removeEventListener('pointerup', up);
		}
		handle.addEventListener('pointermove', move);
		handle.addEventListener('pointerup', up);
	}

	function onKeyDown(event: KeyboardEvent) {
		const step = event.key === 'ArrowLeft' ? -0.02 : event.key === 'ArrowRight' ? 0.02 : 0;
		if (!step) return;
		event.preventDefault();
		editorGroups.resize(props.index, step);
	}
</script>

<div class="bg-surface-200-800 relative w-px shrink-0">
	<!-- a focusable separator is the ARIA pattern for a splitter; svelte counts it as non-interactive -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
	<div
		class="hover:bg-primary-wash active:bg-primary-flood absolute inset-y-0 -left-[3px] z-30 w-[7px] cursor-col-resize transition-colors"
		role="separator"
		aria-orientation="vertical"
		aria-label={m.groups_resize_aria()}
		tabindex="0"
		onpointerdown={onPointerDown}
		ondblclick={() => editorGroups.even()}
		onkeydown={onKeyDown}
	></div>
</div>
