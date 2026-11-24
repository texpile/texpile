<script lang="ts">
	import PaperCropper from '../crop/PaperCropper.svelte';
	import type { ImageCrop, ImageSize } from '../crop/imageCropFormat';

	type CanvasPaperCropProps = {
		url: string;
		read: (size: ImageSize) => ImageCrop;
		shownWidth: number;
		maxWidth: number;
		ondone: (crop: ImageCrop, size: ImageSize) => void;
		oncancel: () => void;
		onheight: (height: number) => void;
	};

	const props: CanvasPaperCropProps = $props();
	let height = $state(0);
	$effect(() => {
		if (height) props.onheight(height);
	});
</script>

<div bind:clientHeight={height}>
	<PaperCropper
		url={props.url}
		read={props.read}
		shownWidth={props.shownWidth}
		maxWidth={props.maxWidth}
		ondone={props.ondone}
		oncancel={props.oncancel}
	/>
</div>
