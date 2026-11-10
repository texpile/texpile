<script lang="ts">
	// the hero's window: one take of the app, playing muted on a loop
	import { untrack } from 'svelte';
	import { SCENE_HEIGHT, SCENE_WIDTH } from './heroScenes';
	import type { ScenePlayer } from './scenePlayer.svelte';

	type HeroSceneWindowProps = { player: ScenePlayer; video: string; poster: string; alt: string };
	const props: HeroSceneWindowProps = $props();
	const { player, video, poster, alt } = $derived(props);
</script>

<!-- the poster is the take's first frame, so the window is whole before the video loads -->
<video
	{@attach (el) => untrack(() => player.attach(el))}
	src={video}
	{poster}
	aria-label={alt}
	width={SCENE_WIDTH}
	height={SCENE_HEIGHT}
	muted
	loop
	playsinline
	disablepictureinpicture
	preload="metadata"
	class="block h-auto w-full"
></video>
