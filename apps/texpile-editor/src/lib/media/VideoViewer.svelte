<script lang="ts">
	import { untrack } from 'svelte';
	import { ImageViewport } from '$lib/images/viewer/imageViewport.svelte';
	import { FLOATING_BAR_BOTTOM } from '$lib/editor/floatingBar';
	import { wheelZoomFactor } from '$lib/preview/zoom/wheelZoom';
	import MediaViewerBar from './MediaViewerBar.svelte';
	import { formatDuration } from './mediaElement';

	type Props = { path: string; url: string; label: string; onfail: () => void };
	const props: Props = $props();

	const view = new ImageViewport(FLOATING_BAR_BOTTOM, true);
	let stage = $state<HTMLDivElement>();
	let box = $state({ w: 0, h: 0 });
	let duration = $state(NaN);
	let loop = $state(false);
	const facts = $derived(view.natural.w ? `${view.natural.w} × ${view.natural.h} px - ${formatDuration(duration)}` : '');

	$effect(() => {
		const { w, h } = box;
		untrack(() => view.setBox(w, h));
	});

	function loaded(e: Event): void {
		const video = e.currentTarget as HTMLVideoElement;
		duration = video.duration;
		view.setNatural(video.videoWidth, video.videoHeight);
	}

	function wheel(e: WheelEvent): void {
		if (!(e.ctrlKey || e.metaKey)) return view.pan(-e.deltaX, -e.deltaY);
		e.preventDefault();
		const r = stage!.getBoundingClientRect();
		view.zoomTo(view.scale * wheelZoomFactor(e), { x: e.clientX - r.left, y: e.clientY - r.top });
	}

	function keys(e: KeyboardEvent): void {
		if (e.target instanceof HTMLVideoElement && e.key !== '+' && e.key !== '-') return;
		if (e.key === '+' || e.key === '=') view.zoomIn();
		else if (e.key === '-') view.zoomOut();
		else if (e.key === '0') view.fit();
		else if (e.key === '1') view.zoomTo(1);
		else return;
		e.preventDefault();
	}
</script>

<div class="relative flex h-full min-h-0 flex-col">
	<MediaViewerBar path={props.path} {facts} {view} {loop} onloop={() => (loop = !loop)} />
	<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
	<div
		bind:this={stage}
		bind:clientWidth={box.w}
		bind:clientHeight={box.h}
		class="relative min-h-0 flex-1 overflow-hidden bg-(--pdf-page-area-bg) outline-none"
		role="application"
		aria-label={props.label}
		tabindex="0"
		onwheel={wheel}
		onkeydown={keys}
	>
		<!-- sized, not scaled: the browser's play controls keep their size at any zoom -->
		<!-- svelte-ignore a11y_media_has_caption -->
		<video
			class="absolute top-0 left-0 max-w-none"
			src={props.url}
			controls
			{loop}
			preload="metadata"
			onloadedmetadata={loaded}
			onerror={props.onfail}
			style:width="{view.natural.w * view.scale}px"
			style:height="{view.natural.h * view.scale}px"
			style:transform="translate({view.x}px, {view.y}px)"
		></video>
	</div>
</div>
