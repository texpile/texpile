<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { Plus } from '@lucide/svelte';
	import type { FigureEditorState } from '../../state/editorState.svelte';
	import Kbd from '$lib/components/Kbd.svelte';
	import { starterName } from './starterLabels';

	const EMPTY_SHEET = { x1: 0, y1: 0, x2: 15, y2: 10 };

	type Props = { editor: FigureEditorState };
	const props: Props = $props();

	const ed = $derived(props.editor);
	const shown = $derived(
		((!!ed.render.drawing && ed.pictureEmpty) || ed.pictureIsNew) &&
			!ed.unclosed &&
			!ed.startersDismissed &&
			ed.tool === 'select' &&
			!ed.libraryShown
	);
	const kinds = $derived(ed.language.newPictures.filter((k) => k.thumb));

	function startEmpty() {
		const blank = ed.language.newPictures.find((k) => !k.thumb);
		if (ed.pictureIsNew && blank) ed.newPicture(blank);
		// a picture of the document's stays, its options with it, and takes the sheet a new one starts with
		else if (ed.picture && !ed.frame) ed.applyEdit(ed.language.writeFrame(ed.source, ed.picture, EMPTY_SHEET));
		ed.startersDismissed = true;
	}
</script>

{#if shown}
	<div class="pointer-events-none absolute inset-0 flex items-center justify-center overflow-auto p-6">
		<section
			class="bg-surface-50-950 border-surface-200-800 rounded-container pointer-events-auto w-full max-w-[640px] border p-4 shadow-lg"
			aria-label={m.figure_start_with()}
		>
			<h2 class="mb-3 text-sm font-semibold">{m.figure_start_with()}</h2>
			<div class="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
				<button class="group flex flex-col gap-1.5 text-left" onclick={startEmpty}>
					<span
						class="border-surface-300-700 group-hover:border-primary-500 rounded-base flex h-24 items-center justify-center border border-dashed bg-white"
					>
						<Plus class="text-muted size-6" />
					</span>
					<span class="text-sm">{m.figure_start_empty()}</span>
				</button>
				{#each kinds as kind (kind.id)}
					<button class="group flex flex-col gap-1.5 text-left" onclick={() => ed.newPicture(kind)}>
						<span
							class="border-surface-200-800 group-hover:border-primary-500 rounded-base flex h-24 items-center justify-center overflow-hidden border bg-white p-2"
						>
							<img src={kind.thumb} alt="" class="max-h-full max-w-full object-contain" />
						</span>
						<span class="text-sm">{starterName(kind)}</span>
					</button>
				{/each}
			</div>
			<p class="text-muted mt-3 flex items-center gap-1.5 text-xs">
				{m.figure_start_note_before()}
				<Kbd keys="?" />
				{m.figure_start_note_after()}
			</p>
		</section>
	</div>
{/if}
