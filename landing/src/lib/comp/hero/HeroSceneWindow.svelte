<script lang="ts">
	import { untrack } from 'svelte';
	import { SCENE_HEIGHT, SCENE_WIDTH } from './heroScenes';
	import type { ScenePlayer } from './scenePlayer.svelte';
	import { whenNear } from './whenNear';

	/** `lazy`: a window further down the page, which waits until it is near the screen to load or play */
	type HeroSceneWindowProps = { player: ScenePlayer; poster: string; alt: string; lazy?: boolean };
	const props: HeroSceneWindowProps = $props();
	const { player, poster, alt, lazy = false } = $derived(props);
</script>

<div class="relative" style="aspect-ratio: {SCENE_WIDTH} / {SCENE_HEIGHT}">
	<!-- the first frame of the first scene, in the HTML, so the window is whole before anything loads; only the
	     hero's is the page's largest picture, and fetched first -->
	<img
		src={poster}
		{alt}
		loading={lazy ? 'lazy' : 'eager'}
		fetchpriority={lazy ? 'auto' : 'high'}
		draggable="false"
		class="absolute inset-0 h-full w-full"
	/>
	<canvas
		{@attach (canvas) => untrack(() => (lazy ? whenNear(canvas, () => player.attach(canvas)) : player.attach(canvas)))}
		width={SCENE_WIDTH}
		height={SCENE_HEIGHT}
		aria-hidden="true"
		class="absolute inset-0 h-full w-full"
		class:invisible={!player.drawn}
	></canvas>

	{#if player.pointer}
		<!-- the arrow is drawn, not captured: it stays sharp at any size, and the scenes stay free of the capturing machine's cursor -->
		<svg
			viewBox="0 0 16 24"
			aria-hidden="true"
			class="pointer"
			class:glides={player.pointerGlides}
			class:invisible={!player.pointerShown}
			style="left: {player.pointer[0] * 100}%; top: {player.pointer[1] * 100}%"
		>
			{#key player.clicks}
				<path
					class:press={player.clicks > 0}
					d="M1.5 1.5 L1.5 19 L5.6 15.1 L8.4 21.6 L11.2 20.4 L8.5 14 L14 14 Z"
					fill="#111"
					stroke="#fff"
					stroke-width="1.6"
					stroke-linejoin="round"
				/>
			{/key}
		</svg>
	{/if}

	{#if player.keys}
		<div
			class="keys absolute bottom-[5%] left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-lg px-3 py-2 font-semibold text-white"
		>
			{#each player.keys as key, i (i)}
				{#if i}<span>+</span>{/if}
				<kbd class="rounded-md border-[1.5px] border-white/75 px-2 font-sans">{key}</kbd>
			{/each}
		</div>
	{/if}
</div>

<style>
	/* about 22 px tall in a 1280 px window; the tip, at (1.5, 1.5), is the point */
	.pointer {
		position: absolute;
		width: 1.25%;
		translate: -9.4% -6.25%;
		overflow: visible;
		pointer-events: none;
		filter: drop-shadow(0 1px 1.5px rgb(0 0 0 / 0.45));
	}
	.pointer.glides {
		transition:
			left 0.45s cubic-bezier(0.4, 0, 0.2, 1),
			top 0.45s cubic-bezier(0.4, 0, 0.2, 1);
	}
	.press {
		transform-origin: 1.5px 1.5px;
		animation: press 0.25s ease-out;
	}
	@keyframes press {
		50% {
			scale: 0.85;
		}
	}
	.keys {
		background: rgb(15 18 24 / 0.88);
		font-size: clamp(0.75rem, 1.5vw, 1.25rem);
	}
</style>
