<script lang="ts">
	import type { FigureEditorState } from '../../state/editorState.svelte';
	import EditMenu from './EditMenu.svelte';
	import FileMenu from './FileMenu.svelte';
	import HelpMenu from './HelpMenu.svelte';
	import ViewMenu from './ViewMenu.svelte';

	type Props = { editor: FigureEditorState };
	const props: Props = $props();
</script>

<nav class="flex items-center gap-0.5 pr-1" aria-label="Menu bar">
	<FileMenu editor={props.editor} />
	<EditMenu editor={props.editor} />
	<ViewMenu editor={props.editor} />
	<HelpMenu editor={props.editor} />
</nav>
