<script lang="ts">
	// under the window, as on Sublime Text's home page: a segment per part of the take, and what the part shows
	import type { HeroTakePart } from './heroScenes';
	import type { ScenePlayer } from './scenePlayer.svelte';

	type HeroSceneGuideProps = { player: ScenePlayer; parts: HeroTakePart[] };
	const props: HeroSceneGuideProps = $props();
	const { player, parts } = $derived(props);

	const part = $derived(parts[player.chapter] ?? parts[0]);
</script>

<div class="pt-5 text-center">
	<div class="flex items-center justify-center gap-2">
		{#each parts as p, i (i)}
			<button
				type="button"
				onclick={() => player.seekChapter(i)}
				aria-label={p.label()}
				aria-current={i === player.chapter}
				class="focus-visible:outline-primary-500 group py-2 outline-none focus-visible:outline-2"
			>
				<span class="block h-1 w-8 overflow-hidden rounded-full bg-white/15 group-hover:bg-white/30 sm:w-12">
					{#if i === player.chapter}
						<span class="block h-full origin-left bg-white" style="transform: scaleX({player.still ? 1 : player.chapterProgress})"></span>
					{/if}
				</span>
			</button>
		{/each}
	</div>
	<p class="mt-2 font-semibold text-white">{part.label()}</p>
	<p class="text-surface-400 text-sm">{part.caption()}</p>
</div>
