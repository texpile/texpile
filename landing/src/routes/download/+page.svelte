<script lang="ts">
	import { Download, ChevronDown, Star } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import { Menu, Portal } from '@skeletonlabs/skeleton-svelte';
	import { trackEvent } from '$lib/plausible';
	import OsLogo from '$lib/comp/OsLogo.svelte';

	// latest.json upgrades the links to versioned files; versions.json feeds the history list.
	// Without either (fetch failed, JS off) the stable root names still download the newest release.
	const DL = 'https://dl.texpile.com';

	type Release = { version: string; publishedAt?: string; files: Record<string, string> };
	let latest = $state<Release | null>(null);
	let history = $state<Release[]>([]);
	let detected = $state<'windows' | 'mac' | 'linux' | null>(null);

	onMount(async () => {
		detected = detectOS();
		try {
			const res = await fetch(`${DL}/latest.json`);
			if (res.ok) latest = await res.json();
		} catch {
			/* keep the stable fallback links */
		}
		try {
			const res = await fetch(`${DL}/versions.json`);
			if (res.ok) {
				const data = await res.json();
				if (Array.isArray(data?.versions)) history = data.versions;
			}
		} catch {
			/* no history section if the manifest is missing */
		}
	});

	function detectOS(): 'windows' | 'mac' | 'linux' | null {
		if (typeof navigator === 'undefined') return null;
		const ua = navigator.userAgent;
		if (/Windows|Win32|Win64/i.test(ua)) return 'windows';
		if (/Macintosh|Mac OS X/i.test(ua) && !/iPhone|iPad|iPod/i.test(ua)) return 'mac';
		if (/Linux|X11/i.test(ua) && !/Android/i.test(ua)) return 'linux';
		return null;
	}

	function fmtDate(iso?: string) {
		if (!iso) return '';
		const d = new Date(iso);
		return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
	}

	type Platform = {
		key: 'windows' | 'mac' | 'linux';
		os: 'windows' | 'apple' | 'linux';
		name: string;
		detail: string;
		fileKey: string;
		fallback: string;
	};
	const PLATFORMS: Platform[] = [
		{ key: 'windows', os: 'windows', name: 'Windows', detail: 'Installer (.exe)', fileKey: 'windows', fallback: 'Texpile-Setup.exe' },
		{ key: 'mac', os: 'apple', name: 'macOS', detail: 'Intel & Apple silicon (.dmg)', fileKey: 'mac', fallback: 'Texpile.dmg' },
		{ key: 'linux', os: 'linux', name: 'Linux', detail: 'AppImage', fileKey: 'linuxAppImage', fallback: 'Texpile.AppImage' }
	];

	const hrefFor = (p: Platform) => `${DL}/${latest?.files[p.fileKey] ?? p.fallback}`;
	const debHref = $derived(`${DL}/${latest?.files.linuxDeb ?? 'texpile.deb'}`);
	const versionLabel = $derived(latest ? `v${latest.version.replace(/^v/, '')}` : null);
	const recommended = $derived(PLATFORMS.find((p) => p.key === detected) ?? null);
	const others = $derived(recommended ? PLATFORMS.filter((p) => p.key !== recommended.key) : PLATFORMS);

	const GITHUB_URL = 'https://github.com/texpile/texpile';

	// this Plausible plan has no custom properties, so the platform goes in the event name
	function trackDownload(platform: string) {
		trackEvent(`Download: ${platform}`);
		downloadModalOpen = true;
	}

	// every download link/menu-item funnels through trackDownload, so this is the one place a
	// "your download is starting" nudge can hook in regardless of which platform was picked
	let downloadModalOpen = $state(false);
	function dismissDownloadModal() {
		downloadModalOpen = false;
	}

	// start a download without navigating away (Linux menu items aren't plain <a> links)
	function triggerDownload(url: string) {
		const a = document.createElement('a');
		a.href = url;
		a.download = '';
		document.body.appendChild(a);
		a.click();
		a.remove();
	}

	function onLinuxSelect(value: string) {
		if (value === 'appimage') {
			trackDownload('Linux');
			triggerDownload(`${DL}/${latest?.files.linuxAppImage ?? 'Texpile.AppImage'}`);
		} else if (value === 'deb') {
			trackDownload('Linux (.deb)');
			triggerDownload(debHref);
		}
	}
</script>

<svelte:head>
	<title>Download Texpile - Windows, macOS, Linux</title>
	<meta name="description" content="Download Texpile, the free offline LaTeX editor, for Windows, macOS, and Linux. No account required." />
	<meta
		name="keywords"
		content="download Texpile, LaTeX editor download, LaTeX editor for Windows, LaTeX editor for macOS, LaTeX editor for Linux"
	/>

	<!-- Page-specific Open Graph -->
	<meta property="og:url" content="https://texpile.com/download" />
	<meta property="og:title" content="Download Texpile - Windows, macOS, Linux" />
	<meta
		property="og:description"
		content="Download Texpile, the free offline LaTeX editor, for Windows, macOS, and Linux. No account required."
	/>

	<!-- Page-specific Twitter -->
	<meta property="twitter:url" content="https://texpile.com/download" />
	<meta property="twitter:title" content="Download Texpile - Windows, macOS, Linux" />
	<meta
		property="twitter:description"
		content="Download Texpile, the free offline LaTeX editor, for Windows, macOS, and Linux. No account required."
	/>

	<link rel="canonical" href="https://texpile.com/download" />
</svelte:head>

<section class="bg-surface-50 border-surface-200 border-b">
	<div class="container mx-auto max-w-3xl px-4 py-14 text-center sm:px-6 md:py-16 lg:px-8">
		<h1 class="text-3xl font-bold md:text-4xl">Download Texpile</h1>
		<p class="text-surface-600 mx-auto mt-4 max-w-xl">Free and fully offline. No account, no cloud, runs on your own machine.</p>
		{#if versionLabel}
			<p class="text-surface-500 mt-3 text-sm">
				Latest release {versionLabel}{#if fmtDate(latest?.publishedAt)}&nbsp;·&nbsp;{fmtDate(latest?.publishedAt)}{/if}
			</p>
		{/if}
	</div>
</section>

<section class="bg-white py-12 md:py-14">
	<div class="container mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
		<!-- lead download for the detected OS -->
		{#if recommended}
			{#if recommended.key === 'linux'}
				<div class="border-surface-200 flex items-center gap-4 rounded-lg border bg-white p-5 sm:gap-5 sm:p-6">
					<div class="bg-primary-500/10 text-primary-600 flex h-14 w-14 shrink-0 items-center justify-center rounded-md">
						<OsLogo os="linux" class="h-8 w-8" />
					</div>
					<div class="min-w-0 flex-1">
						<div class="text-lg font-semibold">Download for Linux</div>
						<div class="text-surface-500 mt-0.5 text-sm">
							AppImage or .deb{#if versionLabel}&nbsp;·&nbsp;{versionLabel}{/if}
						</div>
					</div>
					{@render linuxDownload('lead')}
				</div>
			{:else}
				<a
					href={hrefFor(recommended)}
					download
					onclick={() => trackDownload(recommended.name)}
					class="border-surface-200 hover:border-primary-400 flex items-center gap-4 rounded-lg border bg-white p-5 transition-colors sm:gap-5 sm:p-6"
				>
					<div class="bg-primary-500/10 text-primary-600 flex h-14 w-14 shrink-0 items-center justify-center rounded-md">
						<OsLogo os={recommended.os} class="h-8 w-8" />
					</div>
					<div class="min-w-0 flex-1">
						<div class="text-lg font-semibold">Download for {recommended.name}</div>
						<div class="text-surface-500 mt-0.5 text-sm">
							{recommended.detail}{#if versionLabel}&nbsp;·&nbsp;{versionLabel}{/if}
						</div>
					</div>
					<div
						class="btn preset-filled-primary-500 rounded-base hidden shrink-0 items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white sm:flex"
					>
						<Download class="h-4 w-4" /> Download
					</div>
				</a>
			{/if}
		{/if}

		<div class="mt-10">
			<h2 class="text-surface-500 mb-4 text-center text-xs font-semibold tracking-wide uppercase">
				{recommended ? 'Other platforms' : 'Choose your platform'}
			</h2>
			<div class="flex flex-wrap justify-center gap-4">
				{#each others as p (p.key)}
					<div class="border-surface-200 flex w-full flex-col items-center gap-2.5 rounded-lg border bg-white p-5 text-center sm:w-56">
						<div class="bg-surface-100 text-surface-700 flex h-12 w-12 items-center justify-center rounded-md">
							<OsLogo os={p.os} class="h-7 w-7" />
						</div>
						<div class="font-semibold">{p.name}</div>
						<div class="text-surface-500 text-sm">{p.detail}</div>
						<div class="mt-auto flex flex-col items-center pt-2">
							{#if p.key === 'linux'}
								{@render linuxDownload('grid')}
							{:else}
								<a
									href={hrefFor(p)}
									download
									onclick={() => trackDownload(p.name)}
									class="btn preset-outlined-primary-500 rounded-base inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium"
								>
									<Download class="h-4 w-4" /> Download{#if versionLabel}&nbsp;{versionLabel}{/if}
								</a>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>

		{#if history.length}
			<div class="mt-10">
				<h2 class="text-surface-500 mb-3 text-center text-xs font-semibold tracking-wide uppercase">Version history</h2>
				<div class="border-surface-200 divide-surface-200 divide-y overflow-hidden rounded-lg border bg-white">
					{#each history as r, i (r.version)}
						<div class="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
							<div class="flex items-center gap-2.5">
								<span class="font-semibold">v{r.version.replace(/^v/, '')}</span>
								{#if i === 0}
									<span class="border-surface-300 text-surface-500 rounded-base border px-1.5 py-0.5 text-xs font-medium">Latest</span>
								{/if}
								{#if fmtDate(r.publishedAt)}<span class="text-surface-400 text-sm">{fmtDate(r.publishedAt)}</span>{/if}
							</div>
							<div class="text-primary-600 flex flex-wrap gap-x-4 gap-y-1 text-sm">
								{#if r.files.windows}
									<a class="anchor" href={`${DL}/${r.files.windows}`} download onclick={() => trackDownload('Windows')}>Windows</a>
								{/if}
								{#if r.files.mac}
									<a class="anchor" href={`${DL}/${r.files.mac}`} download onclick={() => trackDownload('macOS')}>macOS</a>
								{/if}
								{#if r.files.linuxAppImage}
									<a class="anchor" href={`${DL}/${r.files.linuxAppImage}`} download onclick={() => trackDownload('Linux')}>AppImage</a>
								{/if}
								{#if r.files.linuxDeb}
									<a class="anchor" href={`${DL}/${r.files.linuxDeb}`} download onclick={() => trackDownload('Linux (.deb)')}>.deb</a>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</section>

{#if downloadModalOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
		role="presentation"
		onmousedown={(e) => e.target === e.currentTarget && dismissDownloadModal()}
	>
		<div class="w-full max-w-sm rounded-lg border border-surface-200 bg-white p-6 text-center shadow-2xl">
			<div class="bg-primary-500/10 text-primary-600 mx-auto flex h-12 w-12 items-center justify-center rounded-full">
				<Download class="h-6 w-6" />
			</div>
			<p class="text-surface-900 mt-4 text-lg font-semibold">Your download is starting…</p>
			<p class="text-surface-600 mt-1.5 text-sm">While you wait, consider starring the project on GitHub to support it.</p>
			<a
				href={GITHUB_URL}
				target="_blank"
				rel="noopener noreferrer"
				class="btn preset-filled-primary-500 rounded-base mt-5 inline-flex w-full items-center justify-center gap-2 py-2.5 text-sm font-semibold text-white"
			>
				<Star class="h-4 w-4" /> Star on GitHub
			</a>
			<button type="button" onclick={dismissDownloadModal} class="text-surface-500 hover:text-surface-700 mt-3 text-sm font-medium">
				Close
			</button>
		</div>
	</div>
{/if}

<svelte:window onkeydown={(e) => e.key === 'Escape' && dismissDownloadModal()} />

{#snippet linuxDownload(variant: 'lead' | 'grid')}
	<Menu onSelect={(details) => onLinuxSelect(details.value)} positioning={{ placement: 'bottom' }}>
		<Menu.Trigger
			class={variant === 'lead'
				? 'btn preset-filled-primary-500 rounded-base flex shrink-0 items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white'
				: 'btn preset-outlined-primary-500 rounded-base inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium'}
		>
			<Download class="h-4 w-4" /> Download{#if variant === 'grid' && versionLabel}&nbsp;{versionLabel}{/if}
			<ChevronDown class="h-4 w-4 opacity-70" />
		</Menu.Trigger>
		<Portal>
			<Menu.Positioner>
				<Menu.Content class="border-surface-200 z-50 min-w-52 rounded-lg border bg-white p-1 shadow-lg outline-none">
					<Menu.Item
						value="deb"
						class="rounded-base hover:bg-surface-100 data-[highlighted]:bg-surface-100 cursor-pointer px-3 py-2 text-sm font-medium"
					>
						<Menu.ItemText>.deb <span class="text-surface-400 font-normal">Debian / Ubuntu</span></Menu.ItemText>
					</Menu.Item>
					<Menu.Item
						value="appimage"
						class="rounded-base hover:bg-surface-100 data-[highlighted]:bg-surface-100 cursor-pointer px-3 py-2 text-sm font-medium"
					>
						<Menu.ItemText>AppImage <span class="text-surface-400 font-normal">other distros, needs libfuse2</span></Menu.ItemText>
					</Menu.Item>
				</Menu.Content>
			</Menu.Positioner>
		</Portal>
	</Menu>
{/snippet}
