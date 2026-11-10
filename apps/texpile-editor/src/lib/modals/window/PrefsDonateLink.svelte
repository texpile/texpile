<script lang="ts">
	import { Heart } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages';
</script>

<div class="flex shrink-0 items-center justify-center gap-1 px-2 py-3 text-sm">
	<Heart class="text-error-500 size-3.5 shrink-0 fill-current" />
	<span class="cap-center min-w-0 truncate">{m.updatemodal_like_texpile()}</span>
	<a class="anchor cap-center shrink-0" href="https://github.com/sponsors/louisqli" target="_blank" rel="noopener noreferrer"
		>{m.updatemodal_donate()}</a
	>
</div>
