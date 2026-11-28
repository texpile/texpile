<script lang="ts">
	import { CircleAlert, FileCheck2 } from '@lucide/svelte';
	import { compileLog } from '$lib/stores/compileLogStore';
	import { m } from '$lib/paraglide/messages';

	const log = $derived(compileLog.current);

	function pages(count: number | undefined): string {
		if (!count) return '';
		return ` (${count === 1 ? m.problems_page_count_one({ count }) : m.problems_page_count_other({ count })})`;
	}
</script>

{#if log}
	<div class="flex items-center gap-1 px-2 py-1">
		{#if log.status.fatal || (log.errors.length > 0 && log.status.pages === undefined)}
			<span class="text-error-ink flex items-center gap-1 font-medium">
				<CircleAlert class="size-3.5" />
				<span class="cap-center">{log.status.fatal ? m.problems_status_failed_no_pdf() : m.problems_status_failed()}</span>
			</span>
		{:else if log.errors.length === 0 && log.warnings.length === 0}
			<span class="text-success-ink flex items-center gap-1 font-medium">
				<FileCheck2 class="size-3.5" />
				<span class="cap-center">{m.problems_status_clean()}{pages(log.status.pages)}</span>
			</span>
		{:else}
			<span class="cap-center">
				{log.errors.length === 1 ? m.problems_error_count_one({ count: 1 }) : m.problems_error_count_other({ count: log.errors.length })}, {log
					.warnings.length === 1
					? m.problems_warning_count_one({ count: 1 })
					: m.problems_warning_count_other({ count: log.warnings.length })}{pages(log.status.pages)}
			</span>
		{/if}
	</div>
{/if}
