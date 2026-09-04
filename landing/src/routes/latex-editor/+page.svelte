<script lang="ts">
	import MousePointerClick from '@lucide/svelte/icons/mouse-pointer-click';
	import Sigma from '@lucide/svelte/icons/sigma';
	import EditorPage from '$lib/comp/EditorPage.svelte';
	import { featureList } from '$lib/features';
	import { STARTUP } from '$lib/startup';
	import { m } from '$lib/paraglide/messages';
	import heroShot from '$lib/assets/showcase/hero-overview.webp';
	import visualShot from '$lib/assets/showcase/editor-latex-visual.webp';
	import sourceShot from '$lib/assets/showcase/editor-latex-source.webp';
	import diffShot from '$lib/assets/showcase/app/diff-view.png';
	import commentsShot from '$lib/assets/showcase/app/comments-latex.png';
	import livePreview from '$lib/assets/showcase/live-preview.webp';
	import collabShot from '$lib/assets/showcase/editor-collab.webp';
	import themesShot from '$lib/assets/showcase/app/preferences-appearance.png';

	const yes = m.word_yes();
	const no = m.word_no();
</script>

<EditorPage
	title={m.lx_title()}
	description={m.lx_meta_description()}
	path="/latex-editor"
	heading={m.lx_heading()}
	lead={m.lx_lead()}
	{heroShot}
	heroAlt={m.hero_shot_alt()}
	ways={{
		sub: m.lx_ways_sub(),
		visual: {
			img: visualShot,
			alt: m.visual_editing_video_aria(),
			heading: m.visual_editing_heading(),
			points: [m.editing_point_1(), m.editing_point_2(), m.editing_point_3(), m.editing_point_5()],
			docs: '/docs/visual-editing'
		},
		source: {
			img: sourceShot,
			alt: m.intellisense_shot_alt(),
			heading: m.source_editing_heading(),
			points: [m.intellisense_point_1(), m.intellisense_point_2(), m.intellisense_point_3(), m.intellisense_point_4()],
			docs: '/docs/latex/intellisense'
		}
	}}
	reviews={{
		diff: {
			img: diffShot,
			alt: m.fmt_history_shot_alt(),
			heading: m.ed_diff_heading(),
			body: m.ed_diff_body(),
			docs: '/docs/version-control'
		},
		comments: {
			img: commentsShot,
			alt: m.comments_shot_alt(),
			heading: m.comments_heading(),
			body: m.comments_body(),
			docs: '/docs/comments'
		}
	}}
	preview={{
		heading: m.live_preview_heading(),
		body: m.lx_preview_body(),
		img: livePreview,
		alt: m.live_preview_video_aria(),
		docs: '/docs/latex/live-preview'
	}}
	collab={{
		heading: m.collab_heading(),
		body: m.collab_body(),
		img: collabShot,
		alt: m.collab_heading(),
		docs: '/docs/collaboration',
		columns: ['Texpile', 'Overleaf', 'VS Code Live Share'],
		// checked against each product's own docs in September 2026; Live Share is end to end encrypted too
		rows: [
			{ label: m.ed_cmp_account(), cells: [m.ed_cmp_account_texpile(), m.ed_cmp_account_overleaf(), m.ed_cmp_account_liveshare()] },
			{ label: m.ed_cmp_e2e(), cells: [yes, m.ed_cmp_e2e_overleaf(), yes] },
			{ label: m.ed_cmp_guest(), cells: [m.ed_cmp_guest_texpile(), m.ed_cmp_guest_overleaf(), m.ed_cmp_guest_liveshare()] },
			{ label: m.ed_cmp_pdf(), cells: [m.ed_cmp_pdf_texpile(), yes, no] },
			{ label: m.ed_cmp_visual(), cells: [yes, yes, no] },
			{ label: m.ed_cmp_comments(), cells: [yes, yes, no] },
			{ label: m.ed_cmp_files(), cells: [m.ed_cmp_files_texpile(), m.ed_cmp_files_overleaf(), m.ed_cmp_files_liveshare()] }
		]
	}}
	themes={{ heading: m.ed_themes_heading(), body: m.ed_themes_body(), img: themesShot, alt: m.ed_themes_shot_alt(), docs: '/docs/themes' }}
	alsoSub={m.lx_also_sub()}
	features={[
		// version history has a section of its own, so SyncTeX and the math preview take its slot
		...featureList().filter((f) => f.key !== 'history'),
		{ key: 'synctex', icon: MousePointerClick, title: m.feature_synctex_title(), body: m.feature_synctex_body() },
		{ key: 'math', icon: Sigma, title: m.feature_math_title(), body: m.feature_math_body() }
	]}
	startup={STARTUP}
	needsLine={m.lx_needs_line()}
/>
