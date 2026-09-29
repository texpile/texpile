<script lang="ts">
	// The explorer's lower pane: Contents, under a header that folds it away, remembered between
	// sessions. There is no Timeline: Local History opens when it is needed, from the File menu and
	// a file's right-click menu (LocalHistoryDialog.svelte), rather than taking room while writing.
	import TableOfContents from './TableOfContents.svelte';
	import SectionHeader from './SectionHeader.svelte';
	import { m } from '$lib/paraglide/messages';

	type Props = { mode: 'visual' | 'source'; onOpenFile?: (file: string, line: number) => void };
	let { mode, onOpenFile }: Props = $props();

	const KEY = 'texpile:explorer-sections';
	function read(): boolean {
		try {
			return !!(JSON.parse(localStorage.getItem(KEY) ?? 'null') as { contents?: boolean } | null)?.contents;
		} catch {
			return false;
		}
	}
	// folded away or not
	let closed = $state(read());
	function toggle() {
		closed = !closed;
		try {
			localStorage.setItem(KEY, JSON.stringify({ contents: closed }));
		} catch {
			// remembered for this session only
		}
	}
</script>

<div class="flex flex-col gap-2">
	<div>
		<SectionHeader title={m.toc_heading()} collapsed={closed} onToggle={toggle} />
		{#if !closed}
			<div class="mt-1"><TableOfContents {mode} {onOpenFile} heading={false} /></div>
		{/if}
	</div>
</div>
