<script lang="ts">
	import Github from '@lucide/svelte/icons/github';
	import Globe from '@lucide/svelte/icons/globe';
	import Check from '@lucide/svelte/icons/check';
	import LogoDark from '$branding/Logo-dark.svg';
	import LogoLight from '$branding/Logo-light.svg';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import { Menu, Portal } from '@skeletonlabs/skeleton-svelte';
	import { locales, localizeHref, getLocale, type Locale } from '$lib/paraglide/runtime';
	import { m } from '$lib/paraglide/messages';
	import { LOCALE_META } from '$lib/localeMeta';

	// absolute hrefs so they resolve from any route, not just the home page
	const navLinks = [
		{ href: '/#features', label: m.nav_features() },
		{ href: '/docs', label: m.nav_docs() },
		{ href: '/download', label: m.nav_download() }
	];

	const currentLocale = getLocale();

	// full document navigation (not client-side routing), same as every other locale switch on this site.
	// details.value is always one of `locales` (that's all the menu ever renders), hence the cast.
	//
	// `base` rather than resolve(): localizeHref returns a rewritten URL (/zh-Hans/docs/mcp) whose locale
	// prefix hooks.ts strips again, so it is never one of the route pathnames resolve() is typed
	// against. Casting it to Pathname was a lie that only type-checked by accident — resolve()'s
	// ResolveArgs is a distributive conditional, so a union argument expands to a union of tuples
	// that no single call can satisfy. Applying `base` is all resolve() did for us anyway.
	function onLocaleSelect(details: { value: string }) {
		const href = localizeHref(page.url.pathname, { locale: details.value as Locale });
		window.location.href = base + href;
	}

	let atTop = $state(true);
	onMount(() => {
		const onScroll = () => (atTop = window.scrollY < 30);
		window.addEventListener('scroll', onScroll);
		onScroll();
		return () => window.removeEventListener('scroll', onScroll);
	});

	// Only the pages that open on an ink band, and only until you scroll off it. route.id is
	// locale-independent (hooks.ts strips the prefix before routing), so this holds in all four.
	const INK_ROUTES = new Set(['/', '/latex-editor', '/typst-editor']);
	const overInk = $derived(INK_ROUTES.has(page.route.id ?? '') && atTop);
</script>

<!-- The header is in normal flow, not overlaid, so "transparent" shows the page background rather
	 than whatever section is below it. Over the ink hero it therefore has to paint ink itself,
	 or it reads as a white bar sitting on top of a dark band. -->
<header
	class="sticky top-0 z-50 border-b backdrop-blur-sm transition-colors duration-200 {overInk
		? 'bg-ink-900 border-transparent'
		: atTop
			? 'border-transparent bg-transparent'
			: 'border-surface-200 bg-surface-50/95'}"
>
	<div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
		<nav class="relative flex h-16 items-center justify-between">
			<a href="/" class="flex items-center">
				<img src={overInk ? LogoLight : LogoDark} alt={m.nav_logo_alt()} class="h-8" />
			</a>

			<div class="absolute left-1/2 hidden -translate-x-1/2 items-center gap-8 md:flex">
				{#each navLinks as link (link.href)}
					<a
						href={link.href}
						class="font-medium transition-colors {overInk
							? 'text-surface-200 hover:text-white'
							: 'text-surface-700 hover:text-primary-600'}"
					>
						{link.label}
					</a>
				{/each}
			</div>

			<div class="flex items-center gap-4">
				<Menu onSelect={onLocaleSelect} positioning={{ placement: 'bottom-end' }}>
					<Menu.Trigger
						class="flex items-center gap-1.5 text-sm font-medium transition-colors {overInk
							? 'text-surface-300 hover:text-white'
							: 'text-surface-600 hover:text-surface-950'}"
						aria-label={m.nav_languages_aria()}
					>
						<Globe class="h-4 w-4" />
						{LOCALE_META[currentLocale]?.short ?? currentLocale}
					</Menu.Trigger>
					<Portal>
						<Menu.Positioner>
							<Menu.Content class="border-surface-200 z-50 min-w-48 rounded-lg border bg-white p-1 shadow-lg outline-none">
								{#each locales as locale (locale)}
									<Menu.Item
										value={locale}
										class="rounded-base hover:bg-surface-100 data-[highlighted]:bg-surface-100 flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm font-medium"
									>
										<Menu.ItemText>
											{LOCALE_META[locale]?.label ?? locale}
										</Menu.ItemText>
										{#if locale === currentLocale}
											<Check class="text-primary-600 h-4 w-4 shrink-0" />
										{/if}
									</Menu.Item>
								{/each}
							</Menu.Content>
						</Menu.Positioner>
					</Portal>
				</Menu>
				<a
					href="https://discord.com/invite/7wanVzCBWf"
					target="_blank"
					rel="noopener noreferrer"
					class="flex items-center transition-colors {overInk
						? 'text-surface-300 hover:text-white'
						: 'text-surface-600 hover:text-surface-950'}"
					aria-label={m.nav_discord_aria()}
				>
					<svg class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
						<path
							d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"
						/>
					</svg>
				</a>
				<a
					href="https://github.com/texpile/texpile"
					target="_blank"
					rel="noopener noreferrer"
					class="flex items-center transition-colors {overInk
						? 'text-surface-300 hover:text-white'
						: 'text-surface-600 hover:text-surface-950'}"
					aria-label={m.nav_github_aria()}
				>
					<Github class="h-5 w-5" />
				</a>
			</div>
		</nav>
	</div>
</header>
