<script lang="ts">
	import { X } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { distros } from '../distros.svelte';
	import { toolDirs } from '../toolDirs.svelte';
	import PrefsRow from '../rows/PrefsRow.svelte';
	import { m } from '$lib/paraglide/messages';

	const dirs = toolDirs;
</script>

<div class="py-4">
	<PrefsRow id="toolchain-dirs" frame="none">
		<button type="button" class="btn preset-tonal text-sm" onclick={() => void dirs.browse()} disabled={dirs.busy}>
			{m.prefs_toolchain_dirs_add_folder()}
		</button>
	</PrefsRow>
	{#if dirs.rows.length}
		<div class="pt-2">
			{#each dirs.rows as row (row.entry)}
				{@const names = distros.namesFor(row)}
				<div class="border-surface-200-800 flex items-center gap-3 border-b py-2 last:border-b-0">
					<span class="min-w-0 flex-1 truncate font-mono text-xs" use:tip={row.absolute}>{row.entry}</span>
					{#if names}
						<span class="text-faint shrink-0 text-xs">{names}</span>
					{/if}
					{#if !row.exists}
						<span class="text-warning-ink shrink-0 text-xs">{m.prefs_toolchain_dir_missing()}</span>
					{/if}
					<button
						class="btn-icon btn-icon-xs hover:preset-tonal opacity-60 hover:opacity-100"
						type="button"
						aria-label={m.prefs_toolchain_dirs_remove()}
						use:tip={m.prefs_toolchain_dirs_remove()}
						onclick={() => void dirs.remove(row.entry)}
						disabled={dirs.busy}
					>
						<X class="size-4" />
					</button>
				</div>
			{/each}
		</div>
	{/if}
</div>
