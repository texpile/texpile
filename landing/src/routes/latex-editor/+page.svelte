<script lang="ts">
	import MousePointerClick from '@lucide/svelte/icons/mouse-pointer-click';
	import Sigma from '@lucide/svelte/icons/sigma';
	import EditorPage from '$lib/comp/EditorPage.svelte';
	import { featureList } from '$lib/features';
	import { m } from '$lib/paraglide/messages';
	import visualShot from '$lib/assets/showcase/editor-latex-visual.webp';
	import sourceShot from '$lib/assets/showcase/editor-latex-source.webp';
	import diffShot from '$lib/assets/showcase/diff.webp';
	import commentsShot from '$lib/assets/showcase/review.webp';
	import themesShot from '$lib/assets/showcase/app/preferences-appearance.png';
</script>

<EditorPage
	title={m.lx_title()}
	description={m.lx_meta_description()}
	path="/latex-editor"
	heading={m.lx_heading()}
	lead={m.lx_lead()}
	format="latex"
	ways={{
		sub: m.lx_ways_sub(),
		visual: {
			img: visualShot,
			alt: m.visual_editing_video_aria(),
			heading: m.visual_editing_heading(),
			points: [m.editing_point_1(), m.editing_point_2(), m.editing_point_3(), m.editing_point_5()],
			docs: '/docs/latex/visual-editor'
		},
		source: {
			img: sourceShot,
			alt: m.intellisense_shot_alt(),
			heading: m.source_editing_heading(),
			points: [m.intellisense_point_1(), m.intellisense_point_2(), m.intellisense_point_3(), m.intellisense_point_4()],
			docs: '/docs/latex/source-editor'
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
		body: m.live_preview_body(),
		alt: m.live_preview_video_aria(),
		docs: '/docs/latex/live-preview'
	}}
	collab={{
		heading: m.collab_heading(),
		body: m.collab_body(),
		alt: m.collab_heading(),
		docs: '/docs/collaboration'
	}}
	themes={{ heading: m.ed_themes_heading(), body: m.ed_themes_body(), img: themesShot, alt: m.ed_themes_shot_alt(), docs: '/docs/themes' }}
	alsoSub={m.lx_also_sub()}
	features={[
		// version history has a section of its own, so SyncTeX and the math preview take its slot
		...featureList().filter((f) => f.key !== 'history'),
		{ key: 'synctex', icon: MousePointerClick, title: m.feature_synctex_title(), body: m.feature_synctex_body() },
		{ key: 'math', icon: Sigma, title: m.feature_math_title(), body: m.feature_math_body() }
	]}
	needsLine={m.lx_needs_line()}
/>
