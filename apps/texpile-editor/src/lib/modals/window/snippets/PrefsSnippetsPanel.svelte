<script lang="ts">
	import { unavailableTip } from '$lib/components/tooltip.svelte';
	import { commandPalette } from '$lib/workspace/commandPalette.svelte';
	import { workspaceRoot } from '$lib/workspace/workspaceStore';
	import { isDesktop } from '$lib/workspace/fileSystem';
	import { preferencesOpen } from '$lib/stores/dialogStore';
	import { ensureProjectSnippets, revealGlobalSnippets } from '$lib/editor/snippets/file/snippetLoader';
	import { describeSnippetProblem, snippetStatus } from '$lib/editor/snippets/file/snippetStatus.svelte';
	import { m } from '$lib/paraglide/messages';

	const ROW = 'border-surface-200-800 flex items-start justify-between gap-6 border-b py-4 last:border-b-0';

	const actions = $derived(commandPalette.actions);
	const root = $derived(actions?.isProject() && actions.isHostWorkspace() ? workspaceRoot.current : null);

	async function editProjectSnippets(): Promise<void> {
		const path = root && (await ensureProjectSnippets(root));
		if (!path || !actions) return;
		actions.openFile(path);
		preferencesOpen.current = false;
	}
</script>

{#snippet fileRow(text: string, hint: string, action: string, run: () => void, why: string)}
	<div class={ROW}>
		<div class="min-w-0">
			<div class="text-sm font-medium">{text}</div>
			<p class="text-muted mt-1 text-xs leading-relaxed">{hint}</p>
		</div>
		<span class="flex" use:unavailableTip={why} data-tip-anchor>
			<button type="button" class="btn preset-tonal btn-sm shrink-0" disabled={!!why} onclick={run}>{action}</button>
		</span>
	</div>
{/snippet}

{@render fileRow(
	m.prefs_snippets_project(),
	m.prefs_snippets_project_note(),
	m.prefs_snippets_edit(),
	() => void editProjectSnippets(),
	root ? '' : m.prefs_snippets_project_none()
)}
{@render fileRow(
	m.prefs_snippets_global(),
	m.prefs_snippets_global_note(),
	m.prefs_snippets_show(),
	() => void revealGlobalSnippets(),
	isDesktop() ? '' : m.unavailable_desktop()
)}
{#if snippetStatus.problems.length}
	<h3 class="text-muted pt-4 pb-1 text-xs font-semibold tracking-wide uppercase">{m.prefs_snippets_problems()}</h3>
	<ul class="text-muted space-y-1 py-2 text-xs leading-relaxed">
		{#each snippetStatus.problems as problem, i (i)}
			<li>{describeSnippetProblem(problem)}</li>
		{/each}
	</ul>
{/if}
