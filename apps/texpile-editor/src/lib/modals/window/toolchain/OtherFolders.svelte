<script lang="ts">
	import { FolderOpen, Plus, X } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { distros } from '../distros.svelte';
	import { toolDirs } from '../toolDirs.svelte';
	import PrefsRow from '../rows/PrefsRow.svelte';
	import { m } from '$lib/paraglide/messages';

	const dirs = toolDirs;
</script>

<PrefsRow id="toolchain-dirs" layout="block" frame="none">
	{#snippet children(def)}
		<h3 class="text-muted pt-4 pb-1 text-xs font-semibold tracking-wide uppercase">{def.label()}</h3>
		<p class="text-muted pb-1 text-xs leading-relaxed">{def.note?.()}</p>
	{/snippet}
</PrefsRow>
{#each dirs.rows as row (row.entry)}
	{@const names = distros.namesFor(row)}
	<div class="border-surface-200-800 flex items-center gap-3 border-b py-2">
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
<form
	class="mt-2 flex items-stretch gap-2"
	onsubmit={(e) => {
		e.preventDefault();
		void dirs.add();
	}}
>
	<input
		class="input min-w-0 flex-1 py-2 text-sm"
		placeholder={m.prefs_toolchain_dirs_placeholder()}
		spellcheck="false"
		bind:value={dirs.draft}
		disabled={dirs.busy}
	/>
	<button
		class="btn preset-tonal shrink-0 px-3"
		type="button"
		aria-label={m.prefs_toolchain_dirs_browse()}
		use:tip={m.prefs_toolchain_dirs_browse()}
		onclick={() => void dirs.browse()}
		disabled={dirs.busy}
	>
		<FolderOpen class="size-4" />
	</button>
	<button
		class="btn preset-filled-primary-500 shrink-0 px-3 disabled:opacity-50"
		type="submit"
		aria-label={m.prefs_toolchain_dirs_add()}
		use:tip={m.prefs_toolchain_dirs_add()}
		disabled={dirs.busy || !dirs.draft.trim()}
	>
		<Plus class="size-4" />
	</button>
</form>
