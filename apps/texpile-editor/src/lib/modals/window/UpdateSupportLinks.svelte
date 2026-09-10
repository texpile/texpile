<script lang="ts">
	import { m } from '$lib/paraglide/messages';

	let { class: cls = '' }: { class?: string } = $props();
</script>

<div class="text-muted flex items-baseline justify-between gap-4 text-sm {cls}">
	<span>{m.updatemodal_like_texpile()}</span>
	<span>
		<a class="anchor" href="https://github.com/texpile/texpile" target="_blank" rel="noopener noreferrer"
			>{m.updatemodal_star_on_github()}</a
		>
		·
		<a class="anchor" href="https://github.com/sponsors/louisqli" target="_blank" rel="noopener noreferrer">{m.updatemodal_donate()}</a>
	</span>
</div>
