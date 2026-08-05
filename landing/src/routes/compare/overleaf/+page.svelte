<script lang="ts">
	import { ArrowRight, Check } from '@lucide/svelte';
	import Section from '$lib/docs/Section.svelte';
	import Note from '$lib/docs/Note.svelte';

	const VERIFIED = 'August 2026';

	const overleafWins = [
		'Nothing to install. You open a browser tab and start typing, with no TeX distribution to set up.',
		'Collaboration is mature and central to the product, not an experiment.',
		'Everyone sees identical output, because everyone compiles on the same server with the same packages.',
		'Your institution may already pay for it, and many journals publish templates directly to it.'
	];

	const texpileWins = [
		'It works with no network at all, on a train or behind an air gap.',
		'Your files are ordinary .tex in an ordinary folder, so any other tool can read them.',
		'You compile with your own TeX, so you pick the engine, the packages, and the versions.',
		'There is no compile timeout, because nothing is being shared with other users.'
	];
</script>

<svelte:head>
	<title>{'Texpile and Overleaf: a local, offline alternative'}</title>
	<meta
		name="description"
		content="An honest comparison of Texpile and Overleaf: where your documents live, what compiles them, whether you can work offline, and which one suits your work."
	/>
	<link rel="canonical" href="https://texpile.com/compare/overleaf" />
	<meta property="og:url" content="https://texpile.com/compare/overleaf" />
	<meta property="og:title" content="Texpile and Overleaf: a local, offline alternative" />
</svelte:head>

<header>
	<a href="/compare" class="text-surface-500 hover:text-surface-900 text-sm transition-colors">{'← All comparisons'}</a>
	<h1 class="text-surface-900 mt-3 text-3xl font-bold md:text-4xl">{'Texpile and Overleaf'}</h1>
	<p class="text-surface-600 mt-4 text-lg leading-relaxed">
		{'These two have more in common than most LaTeX tools. Both let you write visually or in source, both are released under AGPL-3.0, and both can be run entirely on hardware you control. They disagree about one thing, and everything else follows from it: where your document lives.'}
	</p>
</header>

<div class="mt-10 space-y-10">
	<Section
		title={'The one real difference'}
		body={'Overleaf is a server. Your project lives in it, and the server compiles your PDF, whether that is overleaf.com or a copy you host yourself. Texpile is a desktop application. Your project is a folder of .tex files on your disk, and the compiler is the TeX distribution you installed. Everything else on this page is a consequence of that.'}
	/>

	<Section title={'Where Overleaf is the better choice'} body={'Plainly, because it often is:'}>
		<ul class="space-y-3">
			{#each overleafWins as point (point)}
				<li class="flex items-start gap-3">
					<Check class="text-primary-500 mt-1 h-4 w-4 shrink-0" strokeWidth={2.5} />
					<span class="text-surface-700 leading-relaxed">{point}</span>
				</li>
			{/each}
		</ul>
		<div class="mt-6">
			<Note
				body={'Texpile’s own collaboration is experimental. If several people need to edit the same document all day, every day, that is Overleaf’s home ground and we would not pretend otherwise.'}
			/>
		</div>
	</Section>

	<Section title={'Where Texpile is'} body={'The trade runs the other way when the document is mostly yours:'}>
		<ul class="space-y-3">
			{#each texpileWins as point (point)}
				<li class="flex items-start gap-3">
					<Check class="text-primary-500 mt-1 h-4 w-4 shrink-0" strokeWidth={2.5} />
					<span class="text-surface-700 leading-relaxed">{point}</span>
				</li>
			{/each}
		</ul>
	</Section>

	<Section
		title={'Both are open source'}
		body={'This one gets misreported often enough to be worth stating: Overleaf publishes a Community Edition under AGPL-3.0, the same licence Texpile uses, and it can be self-hosted with their Docker toolkit. If your objection to a cloud editor is the licence, Overleaf already answers it. If your objection is that a server has to exist at all, and be kept running and updated, it does not.'}
	>
		<Note
			body={'Overleaf’s own README notes the Community Edition is meant for environments where all users are trusted, as compilation is not sandboxed. That is a real consideration for anyone weighing self-hosting it for a group.'}
		/>
	</Section>

	<Section
		title={'Moving between them'}
		body={'There is no migration, because there is no format to convert. An Overleaf project downloads as .tex, .bib, and image files; open that folder in Texpile and it is your project. Going back is the same in reverse. Texpile never rewrites LaTeX it did not author, so a document can move between the two without accumulating changes.'}
	>
		<div class="flex flex-wrap gap-x-6 gap-y-2">
			<a
				href="/docs/getting-started"
				class="text-primary-600 hover:text-primary-700 inline-flex items-center gap-1.5 font-medium transition-colors"
			>
				{'Opening a folder in Texpile'}
				<ArrowRight class="h-4 w-4" />
			</a>
			<a
				href="/docs/installation"
				class="text-primary-600 hover:text-primary-700 inline-flex items-center gap-1.5 font-medium transition-colors"
			>
				{'Installing Texpile and TeX'}
				<ArrowRight class="h-4 w-4" />
			</a>
		</div>
	</Section>

	<Section
		title={'So which one'}
		body={'If you collaborate constantly, want nothing to install, or your institution already provides it, use Overleaf. If you want your papers on your own disk in a format that outlives any company, compiled by a toolchain you chose, and working whether or not you have a connection, that is what Texpile is for.'}
	>
		<a
			href="/download"
			class="btn preset-filled-primary-500 rounded-base inline-flex items-center gap-2 px-6 py-2.5 font-semibold text-white"
		>
			{'Download Texpile'}
			<ArrowRight class="h-4 w-4" />
		</a>
	</Section>
</div>

<p class="border-surface-200 text-surface-500 mt-12 border-t pt-6 text-sm">
	{`Statements about Overleaf were checked against overleaf.com and the overleaf/overleaf repository, ${VERIFIED}. If any of it has gone out of date, please open an issue and we will correct it.`}
</p>
