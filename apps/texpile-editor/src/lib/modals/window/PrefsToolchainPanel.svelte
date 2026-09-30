<script lang="ts">
	// The Toolchain category: what did we find on this machine. Probe results live in
	// toolchainProbe.svelte.ts so revisiting the tab never re-spawns the ten probe processes.
	import { FolderOpen, Plus, X } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	// eslint-disable-next-line no-restricted-imports -- only the catalog's names/groups; probing gates on the desktop bridge at runtime
	import { toolsInGroup } from '$lib/workspace/toolchainCatalog';
	import { toolchainProbe } from './toolchainProbe.svelte';
	import { toolDirs } from './toolDirs.svelte';
	import { distros } from './distros.svelte';
	import ToolchainDistributionRow from './ToolchainDistributionRow.svelte';
	import ToolchainTinymistRow from './ToolchainTinymistRow.svelte';
	import { tinymistSourceLabel } from './tinymistInstallText';
	import { m } from '$lib/paraglide/messages';

	const probe = toolchainProbe;
	const dirs = toolDirs;
	void dirs.refresh();
	// probed on first view, not on dialog mount: it spawns ten processes, and most users never
	// open this category
	if (probe.tinymist === 'unchecked' && !probe.probing) void probe.run();

	/** rows under a section heading step in on the LEFT only, keeping the value column aligned */
	const SUB = 'pl-4';
</script>

<div class="border-surface-200-800 flex items-center justify-between gap-3 border-b pt-1 pb-3">
	<p class="text-muted text-xs">
		{m.prefs_toolchain_intro()}
		<!-- always shown, not only when something is missing: one place to go, stated up front -->
		{m.prefs_toolchain_docs_hint()}
		<a class="anchor" href="https://texpile.com/docs/installation" target="_blank" rel="noopener noreferrer"
			>{m.prefs_toolchain_install_guide()}</a
		>
	</p>
	<button class="btn preset-tonal shrink-0 text-xs" onclick={() => void probe.run()} disabled={probe.probing}>
		{probe.probing ? m.prefs_toolchain_checking() : m.prefs_toolchain_recheck()}
	</button>
</div>
{#if probe.probeFailed}
	<p class="text-warning-ink pt-3 text-xs">{m.prefs_toolchain_probe_failed()}</p>
{/if}

<h3 class="text-muted pt-4 pb-1 text-xs font-semibold tracking-wide uppercase">{m.prefs_toolchain_dirs()}</h3>
<p class="text-muted pb-1 text-xs leading-relaxed">{m.prefs_toolchain_dirs_hint()}</p>
<div class={SUB}>
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
</div>

{#snippet toolRows(group: 'latex' | 'typst' | 'general', heading: string)}
	<h3 class="text-muted pt-4 pb-1 text-xs font-semibold tracking-wide uppercase">{heading}</h3>
	{#if group !== 'general'}
		<div class={SUB}><ToolchainDistributionRow family={group} /></div>
	{/if}
	<!-- two columns for the LaTeX crowd: one column of name-plus-verdict rows was half whitespace.
	     A group with a single tool (tinymist, git) keeps the full width, so its version line does
	     not truncate for a column that isn't there. The version rides along truncated when needed
	     (hover for the full line); the tool's purpose is the row tooltip -->
	<div class="{SUB} grid gap-x-6 {toolsInGroup(group).length > 1 ? 'grid-cols-2' : 'grid-cols-1'}">
		{#each toolsInGroup(group) as tool (tool.id)}
			{@const hit = probe.probeFor(tool.id)}
			<!-- tinymist resolves through its own path (configured / PATH / managed), so its row reads
			     that result rather than the generic probe -->
			{@const found = tool.id === 'tinymist' ? probe.tinymist !== null && probe.tinymist !== 'unchecked' : !!hit?.found}
			{@const detail =
				tool.id === 'tinymist'
					? probe.tinymist && probe.tinymist !== 'unchecked'
						? `${probe.tinymist.version} (Typst ${probe.tinymist.typstVersion}, ${tinymistSourceLabel(probe.tinymist.source)})`
						: undefined
					: hit?.detail}
			<div class="border-surface-200-800 flex min-w-0 items-baseline gap-2 border-b py-2" use:tip={tool.purpose}>
				<span class="shrink-0 font-mono text-sm font-medium">{tool.name}</span>
				<!-- each row answers on its own, so a slow biber does not hold up the rest -->
				{#if probe.probing && !probe.answered.includes(tool.id)}
					<span class="text-faint text-xs">{m.prefs_toolchain_checking()}</span>
				{:else if probe.probeFailed}
					<span class="text-faint text-xs">…</span>
				{:else}
					<span class="shrink-0 text-xs {found ? (hit?.broken ? 'text-warning-ink' : 'text-success-ink') : 'text-faint'}">
						{found ? (hit?.broken ? m.prefs_toolchain_found_broken() : m.prefs_toolchain_found()) : m.prefs_toolchain_missing()}
					</span>
					{#if !found}
						<button class="anchor shrink-0 text-xs" onclick={() => void dirs.locate(tool.name)} disabled={dirs.busy}>
							{m.prefs_toolchain_locate()}
						</button>
					{/if}
					{#if found && detail}
						<span class="text-faint min-w-0 truncate font-mono text-xs" use:tip={detail}>{detail}</span>
					{/if}
				{/if}
			</div>
		{/each}
	</div>
	{#if group === 'typst'}
		<div class={SUB}><ToolchainTinymistRow /></div>
	{/if}
{/snippet}

{@render toolRows('latex', m.prefs_group_latex())}
{@render toolRows('typst', m.prefs_group_typst())}
<!-- no path box per program: the folders above feed PATH for every one of them -->
{@render toolRows('general', m.prefs_group_vcs())}
