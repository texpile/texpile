<script lang="ts">
	// a .tikz file in Visual: the figure editor on its picture, or a way to start one
	import { untrack } from 'svelte';
	import { SquareDashed } from '@lucide/svelte';
	import { collabHost } from '$lib/collab/hostStore.svelte';
	import { liveText } from '$lib/buffers/liveText.svelte';
	import { changeTextNow } from '$lib/buffers/textNow';
	import { NEW_PICTURE } from '$lib/draw/tikz/source/newPictures';
	import { figureFor, placeOf } from '../anchor/figureAnchors';
	import { picturesIn } from '../anchor/pictureTree';
	import FigureTab from '../tab/FigureTab.svelte';

	type Props = { path: string };
	const props: Props = $props();

	let figure = $state<string | null>(null);
	let loaded = $state(false);
	// the file's picture, held once found; a new one is looked for only when it is deleted
	$effect(() => {
		void collabHost.manifestRev;
		const ytext = collabHost.collabFor(props.path)?.ytext;
		if (!ytext) return;
		const text = liveText(ytext);
		untrack(() => {
			loaded = true;
			const place = figure ? placeOf(figure, ytext, text) : null;
			if (place && place.state !== 'deleted') return;
			const first = picturesIn(text)[0];
			figure = first ? figureFor(props.path, ytext, text, first.from) : null;
		});
	});
</script>

{#if figure}
	{#key figure}
		<FigureTab path={props.path} {figure} />
	{/key}
{:else if loaded}
	<div class="text-muted mx-auto mt-12 flex max-w-md flex-col items-center gap-3 text-center">
		<SquareDashed class="size-8" />
		<p class="text-sm">A figure file needs a <span class="font-mono">tikzpicture</span>.</p>
		<button
			type="button"
			class="btn btn-sm preset-tonal"
			onclick={() => void changeTextNow(props.path, (t) => `${t}${t && !t.endsWith('\n') ? '\n' : ''}${NEW_PICTURE}`)}>Add a picture</button
		>
	</div>
{/if}
