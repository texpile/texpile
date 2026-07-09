<script lang="ts">
	import { Download, ChevronDown, Check } from '@lucide/svelte';
	import Showcase from '$lib/comp/Showcase.svelte';
	import typingWebm from '$lib/assets/showcase/visual-typing.webm';
	import typingMp4 from '$lib/assets/showcase/visual-typing.mp4';
	import intellisenseShot from '$lib/assets/showcase/intellisense-dark.png';
	import errorlogZoomShot from '$lib/assets/showcase/errorlog-zoom-dark.png';
	// feature-grid thumbs, all 5:3
	import thumbSynctex from '$lib/assets/showcase/thumbs/thumb-synctex.png';
	import thumbTerminal from '$lib/assets/showcase/thumbs/thumb-terminal.png';
	import thumbDiff from '$lib/assets/showcase/thumbs/thumb-diff.png';
	import thumbToggle from '$lib/assets/showcase/thumbs/thumb-toggle.png';
	import thumbTree from '$lib/assets/showcase/thumbs/thumb-tree.png';
	import thumbMath from '$lib/assets/showcase/thumbs/thumb-math.png';

	const features = [
		{ shot: thumbSynctex, title: 'SyncTeX', body: 'Click in the PDF to jump to the source line, and back.' },
		{ shot: thumbTerminal, title: 'Built-in terminal', body: 'A real shell for latexmk or any compile command.' },
		{ shot: thumbDiff, title: 'Version history', body: 'Stage, commit, and diff side-by-side against the last commit.' },
		{ shot: thumbToggle, title: 'Visual and source, in sync', body: 'Switching keeps scroll, cursor, and undo history.' },
		{ shot: thumbTree, title: 'Multi-file projects', body: "Fragments parse with the main file's macros." },
		{ shot: thumbMath, title: 'Math preview', body: 'Equations preview live in the source editor.' }
	];

	const editingPoints = [
		'Type @ to reference any equation, figure, table, or citation.',
		'Equations render inline and keep their numbering.',
		'Tables support multirow and multicolumn, edited visually.',
		'Spell check skips your commands and math.'
	];

	// every claim here is backed by the static project parse
	const intellisensePoints = [
		'Autocomplete for commands, environments, \\ref labels, and \\cite keys.',
		'File paths complete inside \\input, \\includegraphics, and \\addbibresource.',
		'References update automatically when you rename or move a file.',
		'Your own \\newcommand macros are picked up.'
	];

	const faqs = [
		{
			q: 'Is it free?',
			a: 'Yes. Texpile is free. The source code will be published on GitHub under AGPL-3.0 when it leaves beta.'
		},
		{
			q: 'Where do my files live?',
			a: 'On your disk, as plain .tex files. There is no database and no proprietary format: what you save is exactly the LaTeX you would write by hand, and you can stop using the app at any time without losing anything.'
		},
		{
			q: 'Does it need an internet connection?',
			a: 'No. The editor, spell check, compiling, and PDF preview all run locally. Nothing is uploaded anywhere.'
		},
		{
			q: 'Will it rewrite my LaTeX?',
			a: 'No. The importer preserves every construct it does not understand as raw LaTeX, and saving a document you have not touched reproduces the file byte for byte. Only the specific blocks you edit are regenerated.'
		},
		{
			q: 'Do I need LaTeX installed?',
			a: 'For compiling PDFs, yes: bring your own TeX distribution (TeX Live, MiKTeX, or MacTeX) and Texpile runs it for you. Editing works without one.'
		},
		{
			q: 'How is this different from Texpile on the web?',
			a: 'The web app at texpile.com is collaborative and compiles in the cloud. This desktop version is a separate, fully offline fork: no sign in, local compilation, and direct access to the folders on your machine.'
		},
		{
			q: 'Why is it built on Electron?',
			a: 'Texpile started as a web app, and the desktop version is a fork of it. The editor is built on ProseMirror and CodeMirror, which both rely on the browser feature contenteditable. That behavior differs between browser engines, and the web version needed many engine-specific fixes for cursor bugs, most of them on Safari. Electron bundles a fixed version of Chromium, so the editor targets one engine on every platform instead of three. Tauri is lighter, but it uses whatever WebView the operating system provides (WebKit on macOS), which reintroduces the cross-engine differences Electron avoids.'
		}
	];

	let openFaq = $state(-1);
</script>

<svelte:head>
	<title>Texpile - a local, offline LaTeX editor</title>
	<meta
		name="description"
		content="Texpile is a free, open source LaTeX editor. Edit your .tex files visually, keep byte-perfect output, compile with your own toolchain, and never leave your machine."
	/>
	<meta
		name="keywords"
		content="LaTeX editor, visual LaTeX editor, WYSIWYG LaTeX editor, offline LaTeX editor, local LaTeX editor, open source LaTeX, LaTeX editor for Windows, LaTeX editor for macOS, LaTeX editor for Linux, .tex editor"
	/>

	<!-- Page-specific Open Graph -->
	<meta property="og:url" content="https://desktop.texpile.com/" />
	<meta property="og:title" content="Texpile - a local, offline LaTeX editor" />
	<meta
		property="og:description"
		content="Edit .tex files visually with byte-perfect saves, built-in git, and local compilation. Free and open source."
	/>

	<!-- Page-specific Twitter -->
	<meta property="twitter:url" content="https://desktop.texpile.com/" />
	<meta property="twitter:title" content="Texpile - a local, offline LaTeX editor" />
	<meta
		property="twitter:description"
		content="Edit .tex files visually with byte-perfect saves, built-in git, and local compilation. Free and open source."
	/>

	<link rel="canonical" href="https://desktop.texpile.com/" />

	<!-- Structured Data -->
	{@html `<script type="application/ld+json">
	{
		"@context": "https://schema.org",
		"@type": "SoftwareApplication",
		"name": "Texpile",
		"description": "Texpile is a free, open source LaTeX editor. Edit your .tex files visually, keep byte-perfect output, compile with your own toolchain, and never leave your machine.",
		"url": "https://desktop.texpile.com",
		"applicationCategory": "ProductivityApplication",
		"operatingSystem": "Windows, macOS, Linux",
		"offers": {
			"@type": "Offer",
			"availability": "https://schema.org/InStock"
		},
		"creator": {
			"@type": "Organization",
			"name": "Texpile"
		},
		"featureList": [
			"Visual and source LaTeX editing, kept in sync",
			"Byte-perfect round-trip saves",
			"Local, fully offline compiling",
			"Built-in terminal and git",
			"SyncTeX forward and inverse search",
			"Multi-file project support"
		]
	}
	</script>`}
</svelte:head>

<section id="top" class="from-primary-50 to-secondary-50 bg-gradient-to-br">
	<div class="container mx-auto px-4 pt-16 pb-6 sm:px-6 md:pt-24 lg:px-8">
		<div class="mx-auto max-w-3xl space-y-6 text-center">
			<h1 class="text-3xl leading-tight font-bold sm:text-4xl">A local, offline, open source LaTeX editor</h1>
			<p class="text-surface-600 mx-auto max-w-2xl text-lg leading-relaxed">
				Texpile edits .tex files visually or in source. It runs entirely on your machine, and what it saves is plain LaTeX. No accounts, no
				cloud.
			</p>
			<div class="flex flex-col items-center justify-center gap-3">
				<a
					href="/download"
					class="btn preset-filled-primary-500 rounded-base inline-flex items-center gap-2 px-7 py-3 font-semibold text-white"
				>
					<Download class="h-5 w-5" /> Download
				</a>
				<p class="text-surface-500 font-mono text-xs">Windows · macOS · Linux · Offline · AGPL-3.0</p>
			</div>
		</div>
	</div>

	<div class="pb-16 md:pb-20">
		<Showcase />
	</div>
</section>

<section id="visual-editing" class="bg-white py-16 md:py-20">
	<div class="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
		<h2 class="text-surface-900 mb-10 text-center text-2xl font-semibold md:text-3xl">Visual editing</h2>
		<div class="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
			<div class="flex flex-col justify-center gap-6">
				<p class="text-surface-600 text-lg leading-relaxed">
					The editor parses your .tex source, renders what it can, and leaves the rest as plain LaTeX.
				</p>
				<ul class="space-y-3">
					{#each editingPoints as point (point)}
						<li class="flex items-start gap-3">
							<Check class="text-primary-500 mt-1 h-4 w-4 shrink-0" strokeWidth={2.5} />
							<span class="text-surface-700 leading-relaxed">{point}</span>
						</li>
					{/each}
				</ul>
			</div>
			<div class="border-surface-200 mx-auto w-fit overflow-hidden rounded-xl border shadow-2xl">
				<!-- muted looping demo, behaves like an animated image -->
				<video
					autoplay
					muted
					loop
					playsinline
					disablepictureinpicture
					aria-label="Typing in the visual editor"
					class="block max-h-[340px] w-auto max-w-full"
				>
					<source src={typingWebm} type="video/webm" />
					<source src={typingMp4} type="video/mp4" />
				</video>
			</div>
		</div>
	</div>
</section>

<section id="intellisense" class="border-surface-200 border-t bg-white py-16 md:py-20">
	<div class="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
		<h2 class="text-surface-900 mb-10 text-center text-2xl font-semibold md:text-3xl">Intellisense</h2>
		<div class="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
			<div class="order-2 lg:order-1">
				<div class="border-surface-200 mx-auto w-fit overflow-hidden rounded-xl border shadow-2xl">
					<img
						src={intellisenseShot}
						alt="Source editor completing \cite with bibliography keys and titles"
						loading="lazy"
						draggable="false"
						class="block max-h-[380px] w-auto max-w-full"
					/>
				</div>
			</div>
			<div class="order-1 space-y-6 lg:order-2">
				<p class="text-surface-600 text-lg leading-relaxed">Texpile statically parses your whole project to produce intellisense.</p>
				<ul class="space-y-3">
					{#each intellisensePoints as point (point)}
						<li class="flex items-start gap-3">
							<Check class="text-primary-500 mt-1 h-4 w-4 shrink-0" strokeWidth={2.5} />
							<span class="text-surface-700 leading-relaxed">{point}</span>
						</li>
					{/each}
				</ul>
			</div>
		</div>
	</div>
</section>

<section id="diagnostics" class="border-surface-200 border-t bg-white py-16 md:py-20">
	<div class="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
		<h2 class="text-surface-900 mb-10 text-center text-2xl font-semibold md:text-3xl">Error log parsing</h2>
		<div class="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
			<div class="space-y-6">
				<p class="text-surface-600 text-lg leading-relaxed">
					Texpile reads the compile log and the bibliography log into a Problems panel. Click a problem to jump to its line.
				</p>
			</div>
			<div class="border-surface-200 mx-auto w-fit overflow-hidden rounded-xl border shadow-2xl">
				<img
					src={errorlogZoomShot}
					alt="Problems panel showing a compile error with a plain-language explanation, followed by warnings"
					loading="lazy"
					draggable="false"
					class="block max-h-[260px] w-auto max-w-full"
				/>
			</div>
		</div>
	</div>
</section>

<section id="features" class="border-surface-200 border-t bg-white py-16 md:py-20">
	<div class="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
		<h2 class="text-surface-900 mb-10 text-center text-2xl font-semibold md:text-3xl">Also included</h2>

		<div class="mx-auto grid max-w-5xl gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
			{#each features as f (f.title)}
				<div>
					<div class="border-surface-200 mb-3 overflow-hidden rounded-lg border">
						<img src={f.shot} alt={f.title} loading="lazy" draggable="false" class="aspect-[5/3] w-full object-cover" />
					</div>
					<h3 class="text-surface-500 mb-1.5 text-base tracking-wider uppercase">{f.title}</h3>
					<p class="text-surface-600 leading-relaxed">{f.body}</p>
				</div>
			{/each}
		</div>
	</div>
</section>

<section id="download" class="border-surface-200 border-t bg-white py-16 md:py-20">
	<div class="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
		<div class="space-y-6 text-center">
			<h2 class="text-surface-900 text-2xl font-semibold md:text-3xl">Download</h2>
			<p class="text-surface-600">Free. Windows, macOS, and Linux. No account, no cloud.</p>
			<a
				href="/download"
				class="btn preset-filled-primary-500 rounded-base inline-flex items-center gap-2 px-7 py-3 font-semibold text-white"
			>
				<Download class="h-5 w-5" /> Download
			</a>
		</div>
	</div>
</section>

<section id="faq" class="border-surface-200 border-t bg-white py-16 md:py-20">
	<div class="container mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
		<h2 class="text-surface-900 mb-10 text-center text-2xl font-semibold md:text-3xl">FAQ</h2>
		<div class="divide-surface-200 border-surface-200 divide-y rounded-lg border">
			{#each faqs as f, i (f.q)}
				<div class="bg-white first:rounded-t-lg last:rounded-b-lg">
					<button
						class="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-medium"
						onclick={() => (openFaq = openFaq === i ? -1 : i)}
						aria-expanded={openFaq === i}
					>
						{f.q}
						<ChevronDown class="text-surface-400 h-5 w-5 shrink-0 transition-transform {openFaq === i ? 'rotate-180' : ''}" />
					</button>
					{#if openFaq === i}
						<p class="text-surface-600 px-5 pb-5 leading-relaxed">{f.a}</p>
					{/if}
				</div>
			{/each}
		</div>
	</div>
</section>
