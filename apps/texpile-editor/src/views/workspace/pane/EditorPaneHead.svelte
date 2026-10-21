<script lang="ts">
	// the pane's tab strip, ending in the editor's own controls
	import TabBar from '../TabBar.svelte';
	import EditorStripControls from './EditorStripControls.svelte';
	import type { ComponentProps } from 'svelte';

	type Props = {
		strip: ComponentProps<typeof TabBar> | null;
		/** null: shown elsewhere, as a file opened on its own shows them in the title bar */
		controls: ComponentProps<typeof EditorStripControls> | null;
	};
	const props: Props = $props();
</script>

{#if props.strip}
	<div class="bg-surface-100-900 border-surface-200-800 @container/strip flex h-9 shrink-0 border-b pr-2">
		<div class="min-w-[150px] flex-1"><TabBar {...props.strip} /></div>
		{#if props.controls}<EditorStripControls {...props.controls} />{/if}
	</div>
{:else if props.controls}
	<!-- an editor in a window of its own has no tabs: its controls still need a place -->
	<div class="bg-surface-100-900 border-surface-200-800 @container/strip flex h-9 shrink-0 items-center justify-end border-b px-2">
		<EditorStripControls {...props.controls} />
	</div>
{/if}
