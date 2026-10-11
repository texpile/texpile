<script lang="ts">
	import { Switch } from '@skeletonlabs/skeleton-svelte';
	import { unavailableTip } from '$lib/components/tooltip.svelte';
	import { commandPalette } from '$lib/workspace/commandPalette.svelte';
	import { workspaceRoot } from '$lib/workspace/workspaceStore';
	import { isDesktop } from '$lib/workspace/fileSystem';
	import { preferencesOpen } from '$lib/stores/dialogStore';
	import {
		ensureGlobalSnippets,
		ensureProjectSnippets,
		setFolderSnippetsOn,
		setGlobalSnippetsOn
	} from '$lib/editor/snippets/file/snippetLoader';
	import { describeSnippetProblem, snippetStatus } from '$lib/editor/snippets/file/snippetStatus.svelte';
	import { m } from '$lib/paraglide/messages';

	const ROW = 'border-surface-200-800 flex items-start justify-between gap-6 border-b py-4 last:border-b-0';

	const actions = $derived(commandPalette.actions);
	const root = $derived(actions?.isProject() && actions.isHostWorkspace() ? workspaceRoot.current : null);

	const loaded = $derived(snippetStatus.loaded);
	const switches = $derived(snippetStatus.switches);

	function countOf(on: boolean, n: number | null, replaced = 0): string {
		if (!on) return m.prefs_snippets_off();
		if (n === null) return '';
		const count = n === 1 ? m.prefs_snippets_loaded_one() : m.prefs_snippets_loaded_other({ count: n });
		return replaced ? `${count}, ${m.prefs_snippets_replaced({ count: replaced })}` : count;
	}

	async function edit(file: Promise<string | null>): Promise<void> {
		const path = await file;
		if (!path || !actions) return;
		actions.openFile(path);
		preferencesOpen.current = false;
	}
</script>

{#snippet fileRow(
	text: string,
	hint: string,
	count: string,
	action: string,
	run: () => void,
	why: string,
	on: boolean,
	setOn: (on: boolean) => void
)}
	<div class={ROW}>
		<div class="min-w-0">
			<div class="text-sm font-medium">{text}</div>
			<p class="text-muted mt-1 text-xs leading-relaxed">{hint}</p>
			{#if count}<p class="text-muted text-xs leading-relaxed">{count}</p>{/if}
		</div>
		<span class="flex shrink-0 items-center gap-3" use:unavailableTip={why} data-tip-anchor>
			<button type="button" class="btn preset-tonal btn-sm" disabled={!!why} onclick={run}>{action}</button>
			<Switch checked={on} disabled={!!why} onCheckedChange={(d) => setOn(d.checked)}>
				<Switch.Control><Switch.Thumb /></Switch.Control>
				<Switch.HiddenInput />
			</Switch>
		</span>
	</div>
{/snippet}

{@render fileRow(
	m.prefs_snippets_project(),
	m.prefs_snippets_project_note(),
	root ? countOf(switches.folder, loaded.project) : '',
	m.prefs_snippets_edit(),
	() => void edit(root ? ensureProjectSnippets(root) : Promise.resolve(null)),
	root ? '' : m.prefs_snippets_project_none(),
	switches.folder,
	(on) => {
		if (root) setFolderSnippetsOn(root, on);
	}
)}
{@render fileRow(
	m.prefs_snippets_global(),
	m.prefs_snippets_global_note(),
	countOf(switches.global, loaded.global, loaded.globalReplaced),
	m.prefs_snippets_edit(),
	() => void edit(ensureGlobalSnippets()),
	!isDesktop() ? m.unavailable_desktop() : actions ? '' : m.prefs_snippets_global_none(),
	switches.global,
	setGlobalSnippetsOn
)}
{#if snippetStatus.problems.length}
	<h3 class="text-muted pt-4 pb-1 text-xs font-semibold tracking-wide uppercase">{m.prefs_snippets_problems()}</h3>
	<ul class="text-muted space-y-1 py-2 text-xs leading-relaxed">
		{#each snippetStatus.problems as problem, i (i)}
			<li>{describeSnippetProblem(problem)}</li>
		{/each}
	</ul>
{/if}
