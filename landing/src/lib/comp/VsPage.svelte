<script module lang="ts">
	/** `better` bolds the cell that wins the row; leave it out when the two are level */
	export type Row = { label: string; texpile: string; other: string; better?: 'texpile' | 'other' };
	export type Vs = {
		/** the other editor's name, as written on its own site */
		name: string;
		url: string;
		path: string;
		title: string;
		description: string;
		lead: string;
		/** the second paragraph under the title: what kind of alternative Texpile is to this editor */
		pitch: string;
		rows: Row[];
		/** optional short sections between the table and the verdicts, for a row that needs more than a cell */
		sections?: { heading: string; body: string }[];
		/** "Use X if": when the other editor is the right pick */
		theirs: string;
		/** "Use Texpile if" */
		ours: string;
	};
</script>

<script lang="ts">
	// One "Texpile vs X" page. English only, like the alternatives page: every claim about the other
	// editor comes from that product's own site, the table carries the facts with the winning cell
	// in bold, and two paragraphs say when to use which. The pages link to each other and to the
	// roundup; nothing on the landing pages or in the footer links here.
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Download from '@lucide/svelte/icons/download';
	import { m } from '$lib/paraglide/messages';

	let { vs }: { vs: Vs } = $props();
	const url = $derived(`https://texpile.com${vs.path}`);
	const CHECKED = 'September 2026';
	const OTHERS = [
		{ href: '/vs/texstudio', label: 'Texpile vs TeXstudio' },
		{ href: '/vs/lyx', label: 'Texpile vs LyX' },
		{ href: '/vs/overleaf', label: 'Texpile vs Overleaf' },
		{ href: '/vs/latex-workshop', label: 'Texpile vs LaTeX Workshop' }
	];
</script>

<svelte:head>
	<title>{vs.title}</title>
	<meta name="description" content={vs.description} />

	<meta property="og:url" content={url} />
	<meta property="og:title" content={vs.title} />
	<meta property="og:description" content={vs.description} />

	<meta property="twitter:url" content={url} />
	<meta property="twitter:title" content={vs.title} />
	<meta property="twitter:description" content={vs.description} />

	<!-- one English page under every locale prefix, so the English URL is canonical for all of them -->
	<link rel="canonical" href={url} />
</svelte:head>

<section class="bg-surface-50 border-surface-200 border-b">
	<div class="container mx-auto max-w-3xl px-4 py-14 sm:px-6 md:py-16 lg:px-8">
		<h1 class="text-surface-900 text-3xl font-bold md:text-4xl">Texpile vs {vs.name}</h1>
		<p class="text-surface-600 mt-4 text-lg leading-relaxed">{vs.lead}</p>
		<p class="text-surface-600 mt-4 text-lg leading-relaxed">{vs.pitch}</p>
	</div>
</section>

<section class="bg-white py-12 md:py-16">
	<div class="container mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
		<div class="border-surface-200 overflow-x-auto rounded-lg border">
			<table class="w-full min-w-xl text-left text-sm">
				<thead class="bg-surface-50 text-surface-700">
					<tr>
						<th scope="col" class="px-4 py-3"></th>
						<th scope="col" class="text-surface-900 px-4 py-3 font-semibold">Texpile</th>
						<th scope="col" class="px-4 py-3 font-semibold">{vs.name}</th>
					</tr>
				</thead>
				<tbody class="text-surface-700">
					{#each vs.rows as row (row.label)}
						<tr class="border-surface-200 border-t">
							<th scope="row" class="text-surface-900 px-4 py-3 align-top font-semibold">{row.label}</th>
							<td class="text-surface-900 px-4 py-3 align-top {row.better === 'texpile' ? 'font-semibold' : ''}">{row.texpile}</td>
							<td class="px-4 py-3 align-top {row.better === 'other' ? 'text-surface-900 font-semibold' : ''}">{row.other}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</section>

<section class="border-surface-200 border-t bg-white py-12 md:py-16">
	<div class="container mx-auto max-w-3xl space-y-10 px-4 sm:px-6 lg:px-8">
		{#each vs.sections ?? [] as s (s.heading)}
			<div>
				<h2 class="text-surface-900 text-2xl font-semibold">{s.heading}</h2>
				<p class="text-surface-600 mt-3 leading-relaxed">{s.body}</p>
			</div>
		{/each}
		<div>
			<h2 class="text-surface-900 text-2xl font-semibold">Use {vs.name} if</h2>
			<p class="text-surface-600 mt-3 leading-relaxed">{vs.theirs}</p>
		</div>
		<div>
			<h2 class="text-surface-900 text-2xl font-semibold">Use Texpile if</h2>
			<p class="text-surface-600 mt-3 leading-relaxed">{vs.ours}</p>
		</div>

		<p class="text-surface-500 text-sm">
			Checked {CHECKED} against
			<a href={vs.url} target="_blank" rel="noopener noreferrer" class="underline hover:text-surface-700">{vs.name}'s own site</a>.
			Corrections are welcome as an
			<a href="https://github.com/texpile/texpile/issues" target="_blank" rel="noopener noreferrer" class="underline hover:text-surface-700"
				>issue on GitHub</a
			>.
		</p>

		<div class="flex flex-wrap items-center gap-4">
			<a
				href="/download"
				class="btn preset-filled-primary-500 rounded-base inline-flex items-center gap-2 px-6 py-2.5 font-semibold text-white"
			>
				<Download class="h-5 w-5" />
				{m.notfound_download()}
			</a>
			<a
				href="/latex-editor"
				class="text-primary-600 hover:text-primary-700 inline-flex items-center gap-1.5 font-medium transition-colors"
			>
				{m.footer_latex()}
				<ArrowRight class="h-4 w-4" />
			</a>
		</div>

		<p class="text-surface-500 text-sm">
			Also:
			{#each OTHERS.filter((o) => o.href !== vs.path) as o, i (o.href)}
				{#if i > 0},{/if}
				<a href={o.href} class="underline hover:text-surface-700">{o.label}</a>
			{/each}
			and <a href="/overleaf-alternatives" class="underline hover:text-surface-700">Overleaf alternatives</a>.
		</p>
	</div>
</section>
