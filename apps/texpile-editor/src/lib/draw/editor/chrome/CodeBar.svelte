<script lang="ts">
	import { Check, Copy } from '@lucide/svelte';
	import type { FigureEditorState } from '../state/editorState.svelte';
	import { copyPictureText } from './menubar/menuBarCommands';

	type Props = { editor: FigureEditorState };
	const props: Props = $props();

	let copied = $state(false);
	async function copy() {
		await copyPictureText(props.editor);
		copied = true;
		setTimeout(() => (copied = false), 1200);
	}
</script>

<!-- a pane header as the sidebar's and the inspector's, then the pane's controls -->
<div class="border-surface-200-800 @container/strip flex h-9 shrink-0 items-center gap-2 border-b pr-2 pl-3">
	<span class="min-w-0 truncate text-sm font-semibold">Code</span>
	<div class="ml-auto flex shrink-0 items-center gap-1.5">
		<button
			class="btn btn-xs preset-outlined-surface-200-800 hover:preset-tonal w-28 justify-center gap-1.5 whitespace-nowrap @max-[22rem]/strip:w-auto"
			onclick={copy}
			aria-label={copied ? 'Copied' : `Copy ${props.editor.language.name}`}
		>
			{#if copied}<Check class="size-4 shrink-0" />{:else}<Copy class="size-4 shrink-0" />{/if}
			<span class="cap-center @max-[22rem]/strip:hidden">{copied ? 'Copied' : `Copy ${props.editor.language.name}`}</span>
		</button>
	</div>
</div>
