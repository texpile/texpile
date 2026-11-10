<script lang="ts">
	// one short recording looping in a section's frame; it loads and plays once it is near the screen
	import { SCENE_HEIGHT, SCENE_WIDTH } from './heroScenes';
	import { whenNear } from './whenNear';

	type SceneLoopProps = { video: string; poster: string; alt: string };
	const props: SceneLoopProps = $props();
	const { video, poster, alt } = $derived(props);

	function playNear(el: HTMLVideoElement) {
		// with reduced motion the poster stays
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		return whenNear(el, () => {
			el.play().catch(() => {});
			return () => el.pause();
		});
	}
</script>

<div class="frame overflow-hidden shadow-2xl">
	<video
		{@attach playNear}
		src={video}
		{poster}
		aria-label={alt}
		width={SCENE_WIDTH}
		height={SCENE_HEIGHT}
		muted
		loop
		playsinline
		disablepictureinpicture
		preload="none"
		class="block h-auto w-full"
	></video>
</div>

<style>
	.frame {
		border-radius: calc(100% * 28 / 2560) / calc(100% * 28 / 1520);
	}

	.frame video {
		transform: scale(1.005);
	}
</style>
