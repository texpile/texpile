<script lang="ts">
	// under the window, as on Sublime Text's home page: a segment per scene, and what the scene shows
	import type { ScenePlayer } from './scenePlayer.svelte';

	type HeroSceneGuideProps = { player: ScenePlayer };
	const props: HeroSceneGuideProps = $props();
	const { player } = $derived(props);

	const scene = $derived(player.scenes[player.active]);
</script>

<div class="pt-5 text-center">
	<div class="flex items-center justify-center gap-2">
		{#each player.scenes as s, i (s.name)}
			<button
				type="button"
				onclick={() => player.select(i)}
				aria-label={s.label()}
				aria-current={i === player.active}
				class="focus-visible:outline-primary-500 group py-2 outline-none focus-visible:outline-2"
			>
				<span class="block h-1 w-8 overflow-hidden rounded-full bg-white/15 group-hover:bg-white/30 sm:w-12">
					{#if i === player.active}
						<span class="block h-full origin-left bg-white" style="transform: scaleX({player.still ? 1 : player.progress})"></span>
					{/if}
				</span>
			</button>
		{/each}
	</div>
	<p class="mt-2 font-semibold text-white">{scene.label()}</p>
	<p class="text-surface-400 text-sm">{scene.caption()}</p>
</div>
