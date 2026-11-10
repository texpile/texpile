<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { basename } from '$lib/workspace/fileSystem';
	import { mediaElementOf } from './mediaElement';
	import AudioPlayer from './AudioPlayer.svelte';
	import VideoViewer from './VideoViewer.svelte';

	type Props = { path: string; url: string };
	const props: Props = $props();

	let failed = $state(false);
</script>

{#if failed}
	<p class="mt-12 text-center text-sm">{m.wsview_media_unplayable({ name: basename(props.path) })}</p>
{:else if mediaElementOf(props.path) === 'audio'}
	<AudioPlayer path={props.path} url={props.url} onfail={() => (failed = true)} />
{:else}
	<VideoViewer path={props.path} url={props.url} label={basename(props.path)} onfail={() => (failed = true)} />
{/if}
