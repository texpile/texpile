<script lang="ts">
	import { Github } from '@lucide/svelte';
	import LogoDark from '$lib/assets/Logo-dark.svg';
	import { onMount } from 'svelte';

	// absolute hrefs so they resolve from any route, not just the home page
	const navLinks = [
		{ href: '/#features', label: 'Features' },
		{ href: '/download', label: 'Download' },
		{ href: '/#faq', label: 'FAQ' }
	];

	let atTop = $state(true);
	onMount(() => {
		const onScroll = () => (atTop = window.scrollY < 30);
		window.addEventListener('scroll', onScroll);
		onScroll();
		return () => window.removeEventListener('scroll', onScroll);
	});
</script>

<header
	class="bg-surface-50/95 sticky top-0 z-50 border-b backdrop-blur-sm transition-colors duration-200 {atTop
		? 'border-transparent'
		: 'border-surface-200'}"
>
	<div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
		<nav class="relative flex h-16 items-center justify-between">
			<a href="/" class="flex items-center">
				<img src={LogoDark} alt="Texpile" class="h-8" />
			</a>

			<div class="absolute left-1/2 hidden -translate-x-1/2 items-center gap-8 md:flex">
				{#each navLinks as link (link.href)}
					<a href={link.href} class="text-surface-700 hover:text-primary-600 font-medium transition-colors">
						{link.label}
					</a>
				{/each}
			</div>

			<div class="flex items-center">
				<a
					href="https://github.com/nullpointerexceptionkek/texpile-monorepo"
					target="_blank"
					rel="noopener noreferrer"
					class="text-surface-600 hover:text-surface-950 flex items-center transition-colors"
					aria-label="Texpile on GitHub"
				>
					<Github class="h-5 w-5" />
				</a>
			</div>
		</nav>
	</div>
</header>
