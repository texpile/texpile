<script lang="ts">
	import type { Node } from 'prosemirror-model';
	import FrameChrome from '../frame/FrameChrome.svelte';

	type FrameChromeOverlayProps = {
		node: Node;
		updateAttrs: (attrs: Record<string, unknown>) => void;
		addPart: (type: 'frame_title' | 'frame_subtitle') => void;
		titleSlide: boolean;
	};

	const props: FrameChromeOverlayProps = $props();
</script>

<div class="beamer-frame-chrome">
	<FrameChrome node={props.node} updateAttrs={props.updateAttrs} addPart={props.addPart} titleSlide={props.titleSlide} />
</div>
