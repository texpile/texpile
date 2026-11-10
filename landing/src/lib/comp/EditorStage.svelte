<!-- The editing stage: one large still, switched by format and between the visual and source view. The captions below pick the still: kinds of content in the visual view, editor features in the source view. -->
<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { reveal } from '$lib/reveal';
	import SegmentSwitch from './SegmentSwitch.svelte';
	import { formatChoice } from './formatChoice.svelte';
	import figureVisual from '$lib/assets/showcase/visual-figure.webp';
	import drawingVisual from '$lib/assets/showcase/visual-drawing.webp';
	import theoremVisual from '$lib/assets/showcase/visual-theorem.webp';
	import beamerVisual from '$lib/assets/showcase/visual-beamer.webp';
	import typstIeee from '$lib/assets/showcase/visual-typst-ieee.webp';
	import drawingTypst from '$lib/assets/showcase/visual-drawing-typst.webp';
	import typstAms from '$lib/assets/showcase/visual-typst-ams.webp';
	import typstBook from '$lib/assets/showcase/visual-typst-book.webp';
	import latexPackages from '$lib/assets/showcase/source-latex-packages.webp';
	import latexKeys from '$lib/assets/showcase/source-latex-keys.webp';
	import latexCite from '$lib/assets/showcase/source-latex-cite.webp';
	import latexChecks from '$lib/assets/showcase/source-latex-checks.webp';
	import typstRef from '$lib/assets/showcase/source-typst-ref.webp';
	import typstArgs from '$lib/assets/showcase/source-typst-args.webp';
	import typstHover from '$lib/assets/showcase/source-typst-hover.webp';
	import typstChecks from '$lib/assets/showcase/source-typst-checks.webp';

	type Format = 'latex' | 'typst';
	type Mode = 'visual' | 'source';

	const FORMATS = [
		{ key: 'latex', label: m.formats_latex_title() },
		{ key: 'typst', label: m.formats_typst_title() }
	] as const;

	const MODES = [
		{ key: 'visual', label: m.stage_visual() },
		{ key: 'source', label: m.stage_source() }
	] as const;

	function universe(name: string): string {
		return m.gallery_universe_template({ name });
	}

	// a visual still explains itself, so its caption only names the paper or the template it shows
	const STILLS: { format: Format; mode: Mode; src: string; title: string; body?: string }[] = [
		{ format: 'latex', mode: 'visual', src: figureVisual, title: m.gallery_figure_title(), body: m.gallery_paper_resnet() },
		{ format: 'latex', mode: 'visual', src: drawingVisual, title: m.gallery_tikz_title() },
		{ format: 'latex', mode: 'visual', src: theoremVisual, title: m.gallery_theorem_title(), body: m.gallery_paper_cbf() },
		{ format: 'latex', mode: 'visual', src: beamerVisual, title: m.gallery_beamer_title() },
		{ format: 'latex', mode: 'source', src: latexPackages, title: m.stage_latex_pkg_title(), body: m.stage_latex_pkg_body() },
		{ format: 'latex', mode: 'source', src: latexKeys, title: m.stage_latex_keys_title(), body: m.stage_latex_keys_body() },
		{ format: 'latex', mode: 'source', src: latexCite, title: m.stage_latex_cite_title(), body: m.stage_latex_cite_body() },
		{ format: 'latex', mode: 'source', src: latexChecks, title: m.stage_latex_check_title(), body: m.stage_latex_check_body() },
		{ format: 'typst', mode: 'visual', src: typstIeee, title: m.gallery_typst_ieee(), body: universe('charged-ieee') },
		{ format: 'typst', mode: 'visual', src: drawingTypst, title: m.gallery_cetz_title() },
		{ format: 'typst', mode: 'visual', src: typstAms, title: m.gallery_typst_ams(), body: universe('unequivocal-ams') },
		{ format: 'typst', mode: 'visual', src: typstBook, title: m.gallery_typst_book(), body: universe('wonderous-book') },
		{ format: 'typst', mode: 'source', src: typstRef, title: m.stage_typst_ref_title(), body: m.stage_typst_ref_body() },
		{ format: 'typst', mode: 'source', src: typstArgs, title: m.stage_typst_args_title(), body: m.stage_typst_args_body() },
		{ format: 'typst', mode: 'source', src: typstHover, title: m.stage_typst_hover_title(), body: m.stage_typst_hover_body() },
		{ format: 'typst', mode: 'source', src: typstChecks, title: m.stage_typst_check_title(), body: m.stage_typst_check_body() }
	];

	// an editor page shows one format only, with no switch for it
	const props: { only?: Format } = $props();
	const format = $derived(props.only ?? formatChoice.current);
	let mode = $state<Mode>('visual');
	let picked = $state(0);
	// A switch lands on the first still of the new format and view, and so does a format picked in the hero.
	const active = $derived(
		STILLS[picked].format === format && STILLS[picked].mode === mode
			? picked
			: STILLS.findIndex((still) => still.format === format && still.mode === mode)
	);

	function show(nextFormat: Format, nextMode: Mode) {
		if (!props.only) formatChoice.current = nextFormat;
		mode = nextMode;
	}
</script>

<div class="mt-6 lg:mt-8" use:reveal>
	<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
		<SegmentSwitch label={m.stage_view()} options={MODES} current={mode} onpick={(next) => show(format, next)} />
		{#if !props.only}
			<SegmentSwitch label={m.hero_scenes_format()} options={FORMATS} current={format} onpick={(next) => show(next, mode)} />
		{/if}
	</div>

	<!-- every still is in the HTML, the inactive ones hidden, so a crawler finds them all -->
	{#each STILLS as still, i (still.src)}
		<!-- a still carries the window's own rounded corners, so the edge and the shadow follow its shape; a box around it would round differently at every width -->
		<!-- the size keeps the frame open while a still loads -->
		<img
			src={still.src}
			alt={still.title}
			width="2560"
			height="1520"
			loading="lazy"
			draggable="false"
			class="block h-auto w-full [filter:drop-shadow(0_0_1px_rgb(0_0_0/0.45))_drop-shadow(0_24px_32px_rgb(0_0_0/0.2))]"
			class:hidden={i !== active}
		/>
	{/each}

	<!-- the captions are the switch between the stills of this format and view: the one on show carries the bar -->
	<div class="mt-6 grid items-start gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
		{#each STILLS as still, i (still.src)}
			<button
				type="button"
				onclick={() => (picked = i)}
				aria-pressed={i === active}
				class="group focus-visible:outline-primary-500 border-t-2 pt-3 text-left transition-colors outline-none focus-visible:outline-2 {i ===
				active
					? 'border-primary-500'
					: 'border-surface-200 hover:border-surface-400'}"
				class:hidden={still.format !== format || still.mode !== mode}
			>
				<span
					class="block font-semibold transition-colors {i === active
						? 'text-surface-950'
						: 'text-surface-500 group-hover:text-surface-900'}"
				>
					{still.title}
				</span>
				{#if still.body}
					<span class="text-surface-600 mt-1 block text-sm leading-snug">{still.body}</span>
				{/if}
			</button>
		{/each}
	</div>
</div>
