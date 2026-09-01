<script lang="ts">
	import TitleBar from './TitleBar.svelte';
	import { fileMode } from '$lib/workspace/fileMode.svelte';
	import { layout } from '$lib/storage/layout';
	import { pdfWidthOf, sidebarWidthOf } from '$lib/workspace/paneGeometry';

	// read once: the window cannot resize between this and the workspace that replaces it
	const winWidth = typeof window === 'undefined' ? 1280 : window.innerWidth;
	// single-file mode paints neither, and the boot path sets it before we render
	const sidebar = $derived(!fileMode.current && layout.current.sidebarOpen ? sidebarWidthOf(layout.current) : 0);
	const preview = $derived(!fileMode.current && layout.current.pdfPaneOpen ? pdfWidthOf(layout.current, winWidth) : 0);
</script>

<div class="flex h-screen flex-col overflow-hidden">
	<TitleBar />
	<div class="flex min-h-0 flex-1">
		{#if sidebar}
			<div class="bg-surface-100-900 border-surface-300-700 shrink-0 border-r" style="width: {sidebar}px"></div>
		{/if}
		<div class="min-w-0 flex-1"></div>
		{#if preview}
			<div class="bg-surface-100-900 border-surface-300-700 shrink-0 border-l" style="width: {preview}px"></div>
		{/if}
	</div>
</div>
