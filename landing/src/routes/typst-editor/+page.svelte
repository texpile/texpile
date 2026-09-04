<script lang="ts">
	import EditorPage from '$lib/comp/EditorPage.svelte';
	import { featureList } from '$lib/features';
	import { STARTUP } from '$lib/startup';
	import { m } from '$lib/paraglide/messages';
	import heroShot from '$lib/assets/showcase/hero-typst.webp';
	import visualShot from '$lib/assets/showcase/editor-typst-visual.webp';
	import sourceShot from '$lib/assets/showcase/editor-typst-source.webp';
	import diffShot from '$lib/assets/showcase/app/diff-view-typst.png';
	import commentsShot from '$lib/assets/showcase/app/comments-typst.png';
	import livePreview from '$lib/assets/showcase/typst-preview.webp';
	import collabShot from '$lib/assets/showcase/editor-collab.webp';
	import themesShot from '$lib/assets/showcase/app/preferences-appearance.png';

	const yes = m.word_yes();
	const no = m.word_no();
</script>

<EditorPage
	title={m.ty_title()}
	description={m.ty_meta_description()}
	path="/typst-editor"
	heading={m.ty_heading()}
	lead={m.ty_lead()}
	{heroShot}
	heroAlt={m.ty_hero_shot_alt()}
	ways={{
		sub: m.ty_ways_sub(),
		visual: {
			img: visualShot,
			alt: m.ty_visual_shot_alt(),
			heading: m.visual_editing_heading(),
			points: [m.typst_visual_1(), m.typst_visual_2(), m.typst_visual_3(), m.typst_visual_4()],
			docs: '/docs/typst'
		},
		source: {
			img: sourceShot,
			alt: m.ty_source_shot_alt(),
			heading: m.source_editing_heading(),
			points: [m.typst_source_1(), m.typst_source_2(), m.typst_source_3(), m.typst_source_4()],
			docs: '/docs/source-editing'
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
		body: m.ty_preview_body(),
		img: livePreview,
		alt: m.ty_preview_anim_alt(),
		docs: '/docs/typst/live-preview'
	}}
	collab={{
		heading: m.collab_heading(),
		body: m.collab_body(),
		img: collabShot,
		alt: m.collab_heading(),
		docs: '/docs/collaboration',
		columns: ['Texpile', m.ed_cmp_col_typstapp(), 'VS Code Live Share'],
		// checked against typst.app's pricing page and Microsoft's Live Share docs in September 2026
		rows: [
			{ label: m.ed_cmp_account(), cells: [m.ed_cmp_account_texpile(), m.ed_cmp_account_typstapp(), m.ed_cmp_account_liveshare()] },
			{ label: m.ed_cmp_e2e(), cells: [yes, m.ed_cmp_e2e_typstapp(), yes] },
			{ label: m.ed_cmp_guest(), cells: [m.ed_cmp_guest_texpile(), m.ed_cmp_guest_typstapp(), m.ed_cmp_guest_liveshare()] },
			{ label: m.ed_cmp_pdf(), cells: [m.ed_cmp_pdf_texpile(), yes, no] },
			{ label: m.ed_cmp_visual(), cells: [yes, no, no] },
			{ label: m.ed_cmp_comments(), cells: [yes, m.ed_cmp_comments_typstapp(), no] },
			{ label: m.ed_cmp_files(), cells: [m.ed_cmp_files_texpile(), m.ed_cmp_files_typstapp(), m.ed_cmp_files_liveshare()] }
		]
	}}
	themes={{ heading: m.ed_themes_heading(), body: m.ed_themes_body(), img: themesShot, alt: m.ed_themes_shot_alt(), docs: '/docs/themes' }}
	alsoSub={m.ty_also_sub()}
	features={featureList().filter((f) => f.key !== 'history')}
	startup={STARTUP.filter((s) => s.name !== 'TeXstudio')}
	needsLine={m.ty_needs_line()}
/>
