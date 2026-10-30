<script lang="ts">
	import { Plus } from '@lucide/svelte';
	import type { FigureEditorState } from '../../state/editorState.svelte';
	import Kbd from '../../ui/Kbd.svelte';

	type Props = { editor: FigureEditorState };
	const props: Props = $props();

	const ed = $derived(props.editor);
	const empty = $derived(!!ed.render.drawing && !ed.picture?.statements.some((s) => s.kind !== 'frame'));
	// once there is something on it, or a tool is picked to draw with, the canvas is the user's
	const shown = $derived((empty || ed.pictureIsNew) && !ed.unclosed && !ed.startersDismissed && ed.tool === 'select' && !ed.libraryShown);
	const kinds = $derived(ed.language.newPictures.filter((k) => k.thumb));

	function startEmpty() {
		const blank = ed.language.newPictures.find((k) => !k.thumb);
		if (ed.pictureIsNew && blank) ed.newPicture(blank);
		ed.startersDismissed = true;
	}
</script>

{#if shown}
	<!-- the sheet under it is paper in either theme, and the canvas around it is not, so it is a card of its own -->
	<div class="pointer-events-none absolute inset-0 flex items-center justify-center overflow-auto p-6">
		<section
			class="bg-surface-50-950 border-surface-200-800 rounded-container pointer-events-auto w-full max-w-[640px] border p-4 shadow-lg"
			aria-label="Start with"
		>
			<h2 class="mb-3 text-sm font-semibold">Start with</h2>
			<div class="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
				<button class="group flex flex-col gap-1.5 text-left" onclick={startEmpty}>
					<span
						class="border-surface-300-700 group-hover:border-primary-500 rounded-base flex h-24 items-center justify-center border border-dashed bg-white"
					>
						<Plus class="size-6 text-gray-400" />
					</span>
					<span class="text-sm">Empty canvas</span>
				</button>
				{#each kinds as kind (kind.id)}
					<button class="group flex flex-col gap-1.5 text-left" onclick={() => ed.newPicture(kind)}>
						<span
							class="border-surface-200-800 group-hover:border-primary-500 rounded-base flex h-24 items-center justify-center overflow-hidden border bg-white p-2"
						>
							<img src={kind.thumb} alt="" class="max-h-full max-w-full object-contain" />
						</span>
						<span class="text-sm">{kind.name}</span>
					</button>
				{/each}
			</div>
			<p class="text-muted mt-3 flex items-center gap-1.5 text-xs">
				Or pick a tool above and draw. Press <Kbd keys="?" /> to see every shortcut.
			</p>
		</section>
	</div>
{/if}
