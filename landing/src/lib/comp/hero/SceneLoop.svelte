<script lang="ts">
	// one screencast on its own, looping in a section's frame: the hero's player with a single scene and no guide
	import { untrack } from 'svelte';
	import HeroSceneWindow from './HeroSceneWindow.svelte';
	import type { HeroScene } from './heroScenes';
	import { ScenePlayer } from './scenePlayer.svelte';

	type SceneLoopProps = { scene: HeroScene; poster: string; alt: string };
	const props: SceneLoopProps = $props();
	const { poster, alt } = $derived(props);

	const player = new ScenePlayer([untrack(() => props.scene)]);
</script>

<div class="border-surface-200 overflow-hidden rounded-xl border shadow-2xl">
	<HeroSceneWindow {player} {poster} {alt} lazy />
</div>
