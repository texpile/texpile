<script lang="ts">
	import MediaViewerBar from './MediaViewerBar.svelte';
	import { formatDuration } from './mediaElement';

	type Props = { path: string; url: string; onfail: () => void };
	const props: Props = $props();

	let duration = $state(NaN);
	let loop = $state(false);
</script>

<div class="relative flex h-full min-h-0 flex-col">
	<MediaViewerBar path={props.path} facts={formatDuration(duration)} {loop} onloop={() => (loop = !loop)} />
	<div class="flex min-h-0 flex-1 items-center justify-center bg-(--pdf-page-area-bg) p-6">
		<audio
			class="w-full max-w-2xl"
			src={props.url}
			controls
			{loop}
			preload="metadata"
			onloadedmetadata={(e) => (duration = e.currentTarget.duration)}
			onerror={props.onfail}
		></audio>
	</div>
</div>
