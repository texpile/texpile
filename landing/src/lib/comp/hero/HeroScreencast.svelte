<script lang="ts">
	// the hero's screencast: the app itself in one take, looping, with its parts marked under the window
	import { untrack } from 'svelte';
	import { m } from '$lib/paraglide/messages';
	import HeroFormatSwitch from './HeroFormatSwitch.svelte';
	import HeroSceneGuide from './HeroSceneGuide.svelte';
	import HeroSceneWindow from './HeroSceneWindow.svelte';
	import { HERO_TAKES, type HeroFormat } from './heroScenes';
	import { ScenePlayer } from './scenePlayer.svelte';
	import { formatChoice } from '../formatChoice.svelte';

	type HeroScreencastProps = { formats: HeroFormat[] };
	const props: HeroScreencastProps = $props();
	const { formats } = $derived(props);

	const starts = (format: HeroFormat) => HERO_TAKES[format].parts.map((p) => p.at);

	// the first format is the one a page opens on; its first frame is in the HTML
	const first = untrack(() => props.formats[0]);
	// a page with both formats follows the shared choice, which the editing stage sets too
	const format = $derived(formats.length > 1 ? formatChoice.current : first);
	const take = $derived(HERO_TAKES[format]);
	const player = new ScenePlayer(starts(first));
	let playing = first;

	$effect(() => {
		if (format === playing) return;
		playing = format;
		player.setStarts(starts(format));
	});

	function pick(next: HeroFormat) {
		formatChoice.current = next;
	}
</script>

<!-- as wide as the capture at most, and never taller than the screen with its guide, so both are in view at once -->
<section aria-label={m.hero_scenes_label()} class="stage mx-auto space-y-3">
	{#if formats.length > 1}
		<div class="flex justify-center">
			<HeroFormatSwitch {formats} current={format} onpick={pick} />
		</div>
	{/if}
	<div class="frame overflow-hidden">
		<!-- a new video element per format, so the other take starts from its own poster -->
		{#key format}
			<HeroSceneWindow {player} video={take.video} poster={take.poster} alt={take.alt()} />
		{/key}
	</div>
	<HeroSceneGuide {player} parts={take.parts} />
</section>

<style>
	.stage {
		width: min(100% - 2rem, 1280px, (100svh - 17rem) * 1280 / 760);
		min-width: min(100% - 2rem, 20rem);
	}

	.frame {
		/* on ink a light shadow is invisible, so a plain deeper one */
		box-shadow: 0 40px 100px -35px rgb(0 0 0 / 0.85);
		/* the capture has the macOS window corner baked in over its backdrop, 28 of 2560 px, so the
		   frame cuts the same corner at any width */
		border-radius: calc(100% * 28 / 2560) / calc(100% * 28 / 1520);
	}

	/* the window's edge is antialiased into the backdrop, so the cut goes a little inside it */
	.frame :global(video) {
		transform: scale(1.005);
	}
</style>
