<script lang="ts">
	// The hero product shot. Sits back small and tilted, then zooms up to full size and flat as
	// you scroll. A single full-app frame rather than a visual/source toggle: the "One file, two
	// ways to write it" section already shows both modes side by side, and this shot's job is to
	// show the whole thing at once, typeset page included.
	import { onMount } from 'svelte';
	import overview from '$lib/assets/showcase/hero-overview.webp';
	import { m } from '$lib/paraglide/messages';

	// the home page's shot by default; an editor page passes the one for its format
	let { shot = overview, alt = m.hero_shot_alt() }: { shot?: string; alt?: string } = $props();

	// finish the zoom well before the hero clears the viewport, so there's still hero left to look at
	const revealOver = () => Math.min(340, Math.max(220, window.innerHeight * 0.42));

	let frame = $state<HTMLDivElement | null>(null);

	onMount(() => {
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

		// no transition on the transform, so these writes land as state rather than as an animation
		const apply = () => frame?.style.setProperty('--reveal', Math.min(window.scrollY / revealOver(), 1).toFixed(3));

		let raf = 0;
		const onScroll = () => {
			if (raf) return;
			raf = requestAnimationFrame(() => {
				raf = 0;
				apply();
			});
		};
		apply();
		window.addEventListener('scroll', onScroll, { passive: true });

		return () => {
			window.removeEventListener('scroll', onScroll);
			cancelAnimationFrame(raf);
		};
	});
</script>

<div class="mx-auto w-full max-w-full px-4 sm:px-6 lg:max-w-[min(1600px,92vw)] lg:px-8">
	<div class="stage">
		<div bind:this={frame} class="frame overflow-hidden rounded-lg border border-white/10">
			<!-- eager + high priority: this is the largest contentful paint on the page -->
			<img src={shot} {alt} loading="eager" fetchpriority="high" draggable="false" class="block h-auto w-full" />
		</div>
	</div>
</div>

<style>
	.stage {
		perspective: 1600px;
	}

	.frame {
		--reveal: 1;
		transform-origin: 50% 20%;
		transform: rotateX(calc((1 - var(--reveal)) * 18deg)) scale(calc(0.86 + var(--reveal) * 0.14));
		/* on ink a light drop shadow is invisible, so the shot gets a plain deeper one. No colour
		   in it: the band is flat, and a tinted shadow would read as a glow behind the screen. */
		box-shadow: 0 40px 100px -35px rgb(0 0 0 / 0.85);
		will-change: transform;
	}

	/* also the no-JS state: the custom property default above leaves it flat, full size, readable */
	@media (prefers-reduced-motion: reduce) {
		.frame {
			--reveal: 1 !important;
		}
	}
</style>
