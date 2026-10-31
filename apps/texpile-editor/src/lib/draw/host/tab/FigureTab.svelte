<script lang="ts">
	// one picture of a .tex or .typ in the figure editor, its edits written into the file as typing is
	import { FigureEditor, TooltipHost, type FigureEditorState } from '$lib/draw/editor';
	import { workspaceRoot } from '$lib/workspace/workspaceStore';
	import { basename } from '$lib/workspace/fileSystem';
	import { offsetToRowCol } from '$lib/workspace/docPositions';
	import { figureProvider, pictureNeeds } from '../engine/figureProvider';
	import { documentPreamble } from '../engine/documentPreamble';
	import DrawingCacheWriter from './DrawingCacheWriter.svelte';
	import FigureTabLayout from './FigureTabLayout.svelte';
	import FigureMissing from './FigureMissing.svelte';
	import { figureWrites } from './figureWrites';
	import { followFigure } from '../anchor/followFigure.svelte';
	import { closeFigure, publishFigure } from '../anchor/openFigures.svelte';
	import { selectedRanges } from '../sourceMarks/selectedRanges';

	type Props = { path: string; figure: string };
	const props: Props = $props();

	const follow = followFigure(() => ({ id: props.figure, path: props.path }));
	const writes = figureWrites(
		() => props.path,
		() => span
	);
	let editor = $state.raw<FigureEditorState | null>(null);
	const provider = figureProvider(props.path, {
		root: () => workspaceRoot.current ?? '',
		preamble: () => documentPreamble(props.path, follow.text, span?.from ?? 0)
	});
	const span = $derived(follow.place?.state === 'shown' ? follow.place.span : null);
	// the editor counts pictures as its own reader finds them
	const index = $derived(span ? provider.language.listPictures(follow.text).findIndex((p) => p.from === span.from) : -1);
	let lastShown = $state('');
	let lastName = $state('tikzpicture');
	const missingLine = $derived(follow.place && follow.place.state !== 'shown' ? offsetToRowCol(follow.text, follow.place.at).row + 1 : 1);

	$effect(() => {
		const text = follow.text;
		if (index < 0) return void (editor = null);
		lastShown = text.slice(span!.from, span!.to);
		lastName = span!.name;
		if (!editor) return;
		editor.shownIndex = index;
		editor.sync(text);
	});
	$effect(() => {
		const place = follow.place;
		publishFigure(props.figure, {
			path: props.path,
			number: place?.state === 'shown' ? place.number : null,
			picture: span && { from: span.from, to: span.to },
			selected: editor && span ? selectedRanges(editor) : []
		});
	});
	$effect(() => () => closeFigure(props.figure));
</script>

{#if index >= 0}
	<FigureEditor.Root
		{provider}
		initial={follow.text}
		picture={index}
		onready={(e) => (editor = e)}
		history={writes.history}
		onchange={writes.write}
	>
		<div class="flex min-h-0 min-w-0 flex-1 overflow-clip">
			<FigureTabLayout />
		</div>
		<DrawingCacheWriter />
	</FigureEditor.Root>
	<TooltipHost />
{:else if follow.place}
	<FigureMissing
		state={follow.place.state === 'deleted' ? 'deleted' : 'incomplete'}
		figure={props.figure}
		drawn={lastShown}
		needs={pictureNeeds(props.path, lastName)}
		file={basename(props.path)}
		line={missingLine}
	/>
{/if}
