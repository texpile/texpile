<script module lang="ts">
	import { localizeHref, type Locale } from '$lib/paraglide/runtime';

	const SITE = 'https://texpile.com';

	// Google keys a searcher by language and region (zh-TW, not zh-Hant), so each script code also
	// carries the regions that write in it. Several codes may point at one URL.
	const CODES: [string, Locale][] = [
		['en', 'en'],
		['x-default', 'en'],
		['zh-Hans', 'zh-Hans'],
		['zh-CN', 'zh-Hans'],
		['zh-SG', 'zh-Hans'],
		['zh-Hant', 'zh-Hant'],
		['zh-TW', 'zh-Hant'],
		['zh-HK', 'zh-Hant'],
		['zh-MO', 'zh-Hant']
	];

	/** The absolute URL of a page in a locale (the current one by default). localizeHref('/')
	 * ends in a slash for a locale, and Pages redirects that to the bare prefix. */
	export function absolute(path: string, locale?: Locale) {
		const href = localizeHref(path, locale ? { locale } : undefined);
		return SITE + (href.length > 1 && href.endsWith('/') ? href.slice(0, -1) : href);
	}
</script>

<script lang="ts">
	// The hreflang links of a translated page. Only for pages with a real translation: an
	// English page served under a locale prefix has no alternates, only a canonical.
	let { path }: { path: string } = $props();
</script>

<svelte:head>
	{#each CODES as [code, locale] (code)}
		<link rel="alternate" hreflang={code} href={absolute(path, locale)} />
	{/each}
</svelte:head>
