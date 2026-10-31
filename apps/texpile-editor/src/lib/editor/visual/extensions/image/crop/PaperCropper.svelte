<script lang="ts">
	// the whole image under a crop box, in the paper where the image was; Enter is Done and Escape is Cancel
	import CropBox from '$lib/images/crop/CropBox.svelte';
	import PaperCropBar from './PaperCropBar.svelte';
	import { PaperCropSession } from './paperCropSession.svelte';
	import type { ImageCrop, ImageSize } from './imageCropFormat';

	type Props = {
		url: string;
		read: (size: ImageSize) => ImageCrop;
		shownWidth: number;
		maxWidth: number;
		ondone: (crop: ImageCrop, size: ImageSize) => void;
		oncancel: () => void;
	};
	const props: Props = $props();

	const session = new PaperCropSession();
	void session.open(props.url, props.read, props.shownWidth, props.maxWidth);

	const frame = $derived({ x: 0, y: 0, w: session.frameWidth, h: session.frameHeight });
	const imageSize = $derived(session.turns % 2 ? { w: frame.h, h: frame.w } : { w: frame.w, h: frame.h });

	function done(): void {
		props.ondone(session.result(), session.size);
	}

	function onkeydown(e: KeyboardEvent): void {
		if (e.key !== 'Enter' && e.key !== 'Escape') return;
		e.preventDefault();
		e.stopPropagation();
		if (e.key === 'Enter') done();
		else props.oncancel();
	}
</script>

<svelte:window onkeydowncapture={onkeydown} />

<div class="paper-cropper flex flex-col items-center gap-2" contenteditable="false">
	{#if session.frameWidth}
		<div class="relative overflow-hidden" style:width="{frame.w}px" style:height="{frame.h}px">
			<img
				class="paper-cropper-image"
				src={props.url}
				alt=""
				draggable="false"
				style:width="{imageSize.w}px"
				style:height="{imageSize.h}px"
				style:transform="translate(-50%, -50%) rotate({-90 * session.turns}deg)"
			/>
			<CropBox rect={frame} crop={session.crop} onchange={(c) => session.setCrop(c)} />
		</div>
		<div style:width="{Math.max(frame.w, 320)}px">
			<PaperCropBar onturn={(dir) => session.turn(dir)} onreset={() => session.reset()} oncancel={props.oncancel} ondone={done} />
		</div>
	{/if}
</div>

<style>
	.paper-cropper-image {
		position: absolute;
		left: 50%;
		top: 50%;
		max-width: none;
	}
</style>
