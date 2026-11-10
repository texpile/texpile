<script lang="ts">
	import PDFViewer from '$lib/preview/PDFViewer.svelte';
	import ImageViewer from '$lib/images/viewer/ImageViewer.svelte';
	import MediaViewer from '$lib/media/MediaViewer.svelte';
	import { basename } from '$lib/workspace/fileSystem';
	import { m } from '$lib/paraglide/messages';

	type Props = { path: string; kind: 'pdf' | 'image' | 'media' | 'binary'; url: string };
	const props: Props = $props();
</script>

{#if props.kind === 'pdf'}
	<!-- a .pdf opened directly: its own src, independent of the compile-output pane -->
	<div class="h-full w-full">
		<PDFViewer src={props.url} filename={basename(props.path)} placement="file" />
	</div>
{:else if props.kind === 'image'}
	<ImageViewer path={props.path} url={props.url} />
{:else if props.kind === 'media'}
	<MediaViewer path={props.path} url={props.url} />
{:else}
	<div class="text-muted mt-12 text-center text-sm">
		{m.wsview_binary_file_note({ name: basename(props.path) })}
	</div>
{/if}
