<script lang="ts">
	// the hero's screencast: the app itself in one take, looping, with its parts marked under the window
	import { untrack } from 'svelte';
	import { m } from '$lib/paraglide/messages';
	import HeroFormatSwitch from './HeroFormatSwitch.svelte';
	import HeroSceneGuide from './HeroSceneGuide.svelte';
	import HeroSceneWindow from './HeroSceneWindow.svelte';
	import { HERO_SETS, type HeroFormat } from './heroScenes';
	import { ScenePlayer } from './scenePlayer.svelte';

	type HeroScreencastProps = { formats: HeroFormat[] };
	const props: HeroScreencastProps = $props();
	const { formats } = $derived(props);

	// the first format is the one a page opens on; its first frame is in the HTML
	const first = untrack(() => props.formats[0]);
	let format = $state(first);
	const player = new ScenePlayer([HERO_SETS[first].take]);

	function pick(next: HeroFormat) {
		if (next === format) return;
		format = next;
		player.setScenes([HERO_SETS[next].take]);
	}
</script>

<!-- as wide as the capture at most, and never taller than the screen with its guide, so both are in view at once -->
<section aria-label={m.hero_scenes_label()} class="stage mx-auto space-y-3">
	{#if formats.length > 1}
		<div class="flex justify-center">
			<HeroFormatSwitch {formats} current={format} onpick={pick} />
		</div>
	{/if}
	<div class="frame overflow-hidden rounded-lg border border-white/10">
		<HeroSceneWindow {player} poster={HERO_SETS[first].poster} alt={HERO_SETS[first].alt()} />
	</div>
	<HeroSceneGuide {player} parts={HERO_SETS[format].parts} />
</section>

<style>
	.stage {
		width: min(100% - 2rem, 1280px, (100svh - 17rem) * 1280 / 760);
		min-width: min(100% - 2rem, 20rem);
	}

	.frame {
		/* on ink a light shadow is invisible, so a plain deeper one */
		box-shadow: 0 40px 100px -35px rgb(0 0 0 / 0.85);
	}
</style>
