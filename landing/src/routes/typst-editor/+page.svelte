<script lang="ts">
	import EditorPage from '$lib/comp/EditorPage.svelte';
	import { featureList } from '$lib/features';
	import { m } from '$lib/paraglide/messages';
	import diffShot from '$lib/assets/showcase/diff-typst.webp';
	import commentsShot from '$lib/assets/showcase/review-typst.webp';
</script>

<EditorPage
	title={m.ty_title()}
	description={m.ty_meta_description()}
	path="/typst-editor"
	heading={m.ty_heading()}
	lead={m.ty_lead()}
	format="typst"
	ways={{
		sub: m.ty_ways_sub(),
		visualDocs: '/docs/typst/visual-editor',
		sourceDocs: '/docs/typst/source-editor'
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
		alt: m.ty_preview_anim_alt(),
		docs: '/docs/typst/live-preview'
	}}
	collab={{
		heading: m.collab_heading(),
		body: m.collab_body(),
		alt: m.collab_heading(),
		docs: '/docs/collaboration'
	}}
	alsoSub={m.ty_also_sub()}
	features={featureList().filter((f) => f.key !== 'history')}
	needsLine={m.ty_needs_line()}
/>
