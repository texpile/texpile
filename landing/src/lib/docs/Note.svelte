<script lang="ts">
	import Info from '@lucide/svelte/icons/info';

	let { html }: { html: string } = $props();
</script>

<div class="not-prose preset-tonal-primary rounded-container my-6 p-4">
	<div class="flex items-start gap-3">
		<Info class="text-primary-ink mt-0.5 h-4 w-4 shrink-0" />
		<div class="doc-links text-sm leading-relaxed [&_p+p]:mt-2">{@html html}</div>
	</div>
</div>
