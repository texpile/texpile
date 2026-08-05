<script lang="ts">
	import { ArrowRight } from '@lucide/svelte';

	// Every cell here is an architectural fact with a source, not a judgement. Verified against each
	// project's own site or repo on the date below; re-check it before editing anything in this table.
	const VERIFIED = 'August 2026';

	type Row = { tool: string; href?: string; files: string; offline: string; compiles: string; editing: string; licence: string };

	const rows: Row[] = [
		{
			tool: 'Texpile',
			files: 'A folder on your disk, as plain .tex',
			offline: 'Yes',
			compiles: 'Your own TeX install',
			editing: 'Visual and source',
			licence: 'AGPL-3.0'
		},
		{
			tool: 'Overleaf',
			href: 'https://www.overleaf.com/',
			files: 'On the server, hosted or self-hosted',
			offline: 'No, needs the server',
			compiles: 'The server',
			editing: 'Visual and source',
			licence: 'AGPL-3.0'
		},
		{
			tool: 'TeXstudio',
			href: 'https://www.texstudio.org/',
			files: 'A folder on your disk, as plain .tex',
			offline: 'Yes',
			compiles: 'Your own TeX install',
			editing: 'Source only',
			licence: 'GPL-3.0'
		},
		{
			tool: 'VS Code + LaTeX Workshop',
			href: 'https://github.com/James-Yu/LaTeX-Workshop',
			files: 'A folder on your disk, as plain .tex',
			offline: 'Yes',
			compiles: 'Your own TeX install',
			editing: 'Source only',
			licence: 'MIT'
		},
		{
			tool: 'LyX',
			href: 'https://www.lyx.org/',
			files: 'Its own .lyx format, exported to LaTeX',
			offline: 'Yes',
			compiles: 'Your own TeX install',
			editing: 'Visual (WYSIWYM)',
			licence: 'Open source'
		}
	];

	const cols = ['Where your files live', 'Works offline', 'What compiles', 'Editing', 'Licence'] as const;
</script>

<svelte:head>
	<title>{'Texpile compared to other LaTeX editors'}</title>
	<meta
		name="description"
		content="How Texpile compares to Overleaf, TeXstudio, VS Code with LaTeX Workshop, and LyX: where your files live, whether it works offline, and what does the compiling."
	/>
	<link rel="canonical" href="https://texpile.com/compare" />
	<meta property="og:url" content="https://texpile.com/compare" />
	<meta property="og:title" content="Texpile compared to other LaTeX editors" />
</svelte:head>

<header>
	<h1 class="text-surface-900 text-3xl font-bold md:text-4xl">{'Texpile compared to other LaTeX editors'}</h1>
	<p class="text-surface-600 mt-4 text-lg leading-relaxed">
		{'There is no single best LaTeX editor, and the honest differences between them are architectural rather than a matter of features. Three questions separate almost all of them: where your document actually lives, whether you can work without a network, and whose machine runs the compiler.'}
	</p>
</header>

<div class="border-surface-200 mt-10 overflow-x-auto rounded-lg border">
	<table class="w-full min-w-[46rem] border-collapse text-sm">
		<thead>
			<tr class="border-surface-200 bg-surface-50 border-b">
				<th scope="col" class="text-surface-900 px-4 py-3 text-left font-semibold">{'Editor'}</th>
				{#each cols as c (c)}
					<th scope="col" class="text-surface-500 px-4 py-3 text-left text-xs font-semibold tracking-wide uppercase">{c}</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each rows as r (r.tool)}
				<tr class="border-surface-200 border-b last:border-b-0 {r.tool === 'Texpile' ? 'bg-primary-50/50' : ''}">
					<th scope="row" class="text-surface-900 px-4 py-3 text-left font-semibold whitespace-nowrap">
						{#if r.href}
							<a href={r.href} target="_blank" rel="noopener noreferrer" class="hover:text-primary-600 transition-colors">{r.tool}</a>
						{:else}
							{r.tool}
						{/if}
					</th>
					<td class="text-surface-700 px-4 py-3">{r.files}</td>
					<td class="text-surface-700 px-4 py-3">{r.offline}</td>
					<td class="text-surface-700 px-4 py-3">{r.compiles}</td>
					<td class="text-surface-700 px-4 py-3">{r.editing}</td>
					<td class="text-surface-700 px-4 py-3">{r.licence}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<p class="text-surface-500 mt-4 text-sm">
	{`Verified against each project's own site or repository, ${VERIFIED}. If something here has gone out of date, please open an issue.`}
</p>

<div class="mt-12 space-y-6">
	<h2 class="text-surface-900 text-xl font-semibold md:text-2xl">{'In more detail'}</h2>
	<a href="/compare/overleaf" class="border-surface-200 hover:border-primary-400 group block rounded-lg border p-5 transition-colors">
		<span class="text-surface-900 group-hover:text-primary-600 font-semibold">{'Texpile and Overleaf'}</span>
		<span class="text-surface-600 mt-1.5 block text-sm leading-relaxed">
			{'The closest comparison, and the one with the most to say: both edit visually and in source, both are AGPL-3.0, and they disagree about where your document should live.'}
		</span>
		<span class="text-primary-600 mt-3 inline-flex items-center gap-1.5 text-sm font-medium">
			{'Read the comparison'}
			<ArrowRight class="h-4 w-4" />
		</span>
	</a>
</div>
