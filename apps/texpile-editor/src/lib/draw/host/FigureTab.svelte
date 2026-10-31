<script lang="ts">
	// one picture of a .tex in the figure editor, its edits written into the file as typing is
	import { FigureEditor, TooltipHost, type FigureEditorState } from '$lib/draw/editor';
	import type { FigureProvider } from '$lib/draw/editor/provider/figureEngine';
	import { tikzLanguage } from '$lib/draw/tikz/tikzLanguage';
	import { changeTextNow, textNow } from '$lib/buffers/textNow';
	import { workspaceRoot } from '$lib/workspace/workspaceStore';
	import { desktopTikzEngine } from './desktopTikzEngine';
	import { documentPreamble } from './documentPreamble';
	import DrawingCacheWriter from './DrawingCacheWriter.svelte';
	import FigureTabLayout from './FigureTabLayout.svelte';
	import { followFileText } from './followFileText.svelte';

	type Props = { path: string; picture: number };
	const props: Props = $props();

	let latest = '';
	let editor: FigureEditorState | null = null;
	const provider: FigureProvider = {
		language: tikzLanguage,
		engine: desktopTikzEngine({ root: () => workspaceRoot.current ?? '', preamble: () => documentPreamble(latest) })
	};
	const loading = textNow(props.path).then((t) => (latest = t));
	followFileText(
		() => props.path,
		(text) => {
			latest = text;
			editor?.sync(text);
		}
	);
</script>

{#await loading then initial}
	<FigureEditor.Root
		{provider}
		{initial}
		picture={props.picture}
		onready={(e) => (editor = e)}
		onchange={(s) => {
			latest = s;
			void changeTextNow(props.path, () => s);
		}}
	>
		<div class="flex min-h-0 min-w-0 flex-1 overflow-clip">
			<FigureTabLayout />
		</div>
		<DrawingCacheWriter />
	</FigureEditor.Root>
	<TooltipHost />
{/await}
