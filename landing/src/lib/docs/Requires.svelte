<script lang="ts">
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

	// what a feature needs beyond Texpile itself, as one chip: "Requires git"
	let { html }: { html: string } = $props();
</script>

<p class="not-prose doc-links preset-tonal-warning my-5 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm">
	<TriangleAlert class="text-warning-ink h-3.5 w-3.5 shrink-0" />
	<span>Requires {@html html}</span>
</p>
