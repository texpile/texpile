<script lang="ts">
	import CodeBar from '../chrome/CodeBar.svelte';
	import ProblemsPanel from './problems/ProblemsPanel.svelte';
	import type { FigureEditorState } from '../state/editorState.svelte';

	type Props = { editor: FigureEditorState };
	const props: Props = $props();

	// the view belongs to the editor state, so its text and history outlive the pane being shut
	function host(el: HTMLElement) {
		el.append(props.editor.code.view.dom);
		return () => props.editor.code.view.dom.remove();
	}
</script>

<div class="flex h-full min-h-0 shrink-0 flex-col" style:width="{props.editor.panes.codeWidth}px">
	<CodeBar editor={props.editor} />
	<div class="bg-surface-50-950 min-h-0 flex-1" {@attach host}></div>
	<ProblemsPanel editor={props.editor} />
</div>
