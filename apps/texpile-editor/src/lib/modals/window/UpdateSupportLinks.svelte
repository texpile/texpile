<script lang="ts">
	import { Heart, Star } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages';

	let { class: cls = '' }: { class?: string } = $props();
</script>

<div class="flex items-center justify-between gap-4 text-sm {cls}">
	<span class="cap-center">{m.updatemodal_like_texpile()}</span>
	<span class="flex items-center gap-3">
		<a class="anchor flex items-center gap-1.5" href="https://github.com/texpile/texpile" target="_blank" rel="noopener noreferrer">
			<Star class="text-warning-500 size-4 fill-current" /><span class="cap-center">{m.updatemodal_star_on_github()}</span>
		</a>
		<a class="anchor flex items-center gap-1.5" href="https://github.com/sponsors/louisqli" target="_blank" rel="noopener noreferrer">
			<Heart class="text-error-500 size-4 fill-current" /><span class="cap-center">{m.updatemodal_donate()}</span>
		</a>
	</span>
</div>
