<script lang="ts">
	import Info from '@lucide/svelte/icons/info';

	let { html }: { html: string } = $props();
</script>

<div class="not-prose border-primary-500/30 bg-primary-50/60 my-6 rounded-lg border p-4">
	<div class="flex items-start gap-3">
		<Info class="text-primary-600 mt-0.5 h-4 w-4 shrink-0" />
		<div class="text-surface-700 text-sm leading-relaxed [&_p+p]:mt-2">{@html html}</div>
	</div>
</div>
