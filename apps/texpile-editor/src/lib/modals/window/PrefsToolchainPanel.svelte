<script lang="ts">
	// The Toolchain category: what did we find on this machine. Probe results live in
	// toolchainProbe.svelte.ts so revisiting the tab never re-spawns the ten probe processes.
	// eslint-disable-next-line no-restricted-imports -- only the catalog's names/groups; probing gates on the desktop bridge at runtime
	import { tip } from '$lib/components/tooltip.svelte';
	import { toolsInGroup } from '$lib/workspace/toolchainCatalog';
	import { toolchainProbe } from './toolchainProbe.svelte';
	import { m } from '$lib/paraglide/messages';

	const probe = toolchainProbe;
	// probed on first view, not on dialog mount: it spawns ten processes, and most users never
	// open this category
	if (probe.tinymist === 'unchecked' && !probe.probing) void probe.run();

	/** rows under a section heading step in on the LEFT only, keeping the value column aligned */
	const SUB = 'pl-4';
</script>

<div class="border-surface-200-800 flex items-center justify-between gap-3 border-b pt-1 pb-3">
	<p class="text-surface-500 text-xs">
		{m.prefs_toolchain_intro()}
		<!-- always shown, not only when something is missing: one place to go, stated up front -->
		{m.prefs_toolchain_docs_hint()}
		<a class="anchor" href="https://texpile.com/docs/installation" target="_blank" rel="noopener noreferrer"
			>{m.prefs_toolchain_install_guide()}</a
		>
	</p>
	<button class="btn preset-tonal shrink-0 text-xs" onclick={() => void probe.run()} disabled={probe.probing}>
		{m.prefs_toolchain_recheck()}
	</button>
</div>
{#if probe.probeFailed}
	<p class="text-warning-700-300 pt-3 text-xs">{m.prefs_toolchain_probe_failed()}</p>
{/if}

{#snippet toolRows(group: 'latex' | 'typst' | 'general', heading: string)}
	<h3 class="text-surface-600-300 pt-4 pb-1 text-xs font-semibold tracking-wide uppercase">{heading}</h3>
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
						? `${probe.tinymist.version} (Typst ${probe.tinymist.typstVersion}, ${probe.tinymist.source})`
						: undefined
					: hit?.detail}
			<div class="border-surface-200-800 flex min-w-0 items-baseline gap-2 border-b py-2" use:tip={tool.purpose}>
				<span class="shrink-0 font-mono text-sm font-medium">{tool.name}</span>
				{#if probe.probing || probe.probeFailed}
					<span class="text-surface-400 text-xs">…</span>
				{:else}
					<span class="shrink-0 text-xs {found ? 'text-success-600-400' : 'text-surface-400'}">
						{found ? m.prefs_toolchain_found() : m.prefs_toolchain_missing()}
					</span>
					{#if found && detail}
						<span class="text-surface-400 min-w-0 truncate font-mono text-xs" use:tip={detail}>{detail}</span>
					{/if}
				{/if}
			</div>
		{/each}
	</div>
{/snippet}

{@render toolRows('latex', m.prefs_group_latex())}
{@render toolRows('typst', m.prefs_group_typst())}
<!-- No path box for tinymist, and none for the eight above it either. Where a program lives is
     the operating system's answer to give: every installer puts it on PATH, and shellEnvReady()
     already recovers the login-shell PATH a GUI launch misses. -->
{@render toolRows('general', m.prefs_group_vcs())}
