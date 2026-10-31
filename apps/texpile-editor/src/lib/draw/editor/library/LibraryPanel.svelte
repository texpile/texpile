<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { X } from '@lucide/svelte';
	import type { FigureEditorState } from '../state/editorState.svelte';
	import { TEXT_FIELD } from '../ui/panelStyles';
	import { elementGroups, insertElement } from './libraryCommands';
	import LibraryTile from './LibraryTile.svelte';
	import { groupLabel } from './libraryLabels';

	type Props = { editor: FigureEditorState };
	const props: Props = $props();
	const ed = $derived(props.editor);

	let query = $state('');
	let panel = $state<HTMLElement>();
	// while a tile is dragged the panel lets the drop through to the canvas under it
	let dragging = $state(false);
	const groups = $derived(elementGroups(ed.language.libraryElements, query));

	function close() {
		ed.showLibrary(false);
		query = '';
	}

	// a press anywhere else closes it, as a menu does; a drag out of it onto the canvas is not a press elsewhere
	function onWindowPointerDown(e: PointerEvent) {
		const target = e.target as Element;
		if (ed.libraryShown && !panel?.contains(target) && !target.closest('[data-library-toggle]')) close();
	}
</script>

<svelte:window onpointerdown={onWindowPointerDown} />

{#if ed.libraryShown}
	<section
		bind:this={panel}
		class="bg-surface-50-950 border-surface-200-800 rounded-container absolute top-16 left-1/2 z-30 flex max-h-[min(70vh,560px)] w-[min(560px,calc(100%-24px))] -translate-x-1/2 flex-col border shadow-lg {dragging
			? 'pointer-events-none opacity-30'
			: ''}"
		aria-label={m.figure_library()}
		data-own-scroll
	>
		<div class="flex items-center gap-2 p-3 pb-2">
			<input
				class={TEXT_FIELD}
				placeholder={m.figure_library_search_placeholder()}
				aria-label={m.figure_library_search()}
				{@attach (el) => el.focus()}
				bind:value={query}
				onkeydown={(e) => e.key === 'Escape' && (e.stopPropagation(), close())}
			/>
			<button class="btn-icon btn-icon-xs hover:preset-tonal" aria-label={m.figure_library_close()} onclick={close}
				><X class="size-4" /></button
			>
		</div>
		<div class="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
			{#each groups as [group, elements] (group)}
				<h3 class="text-muted pt-2 pb-1.5 text-xs font-semibold">{groupLabel(group)}</h3>
				<div class="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2">
					{#each elements as element (element.id)}
						<LibraryTile
							{element}
							ondragging={(on) => (dragging = on)}
							onpick={() => {
								insertElement(ed, element, null);
								close();
							}}
						/>
					{/each}
				</div>
			{:else}
				<p class="text-muted py-6 text-center text-sm">{m.figure_library_empty()}</p>
			{/each}
			<p class="text-muted pt-3 text-xs">{m.figure_library_note()}</p>
		</div>
	</section>
{/if}
