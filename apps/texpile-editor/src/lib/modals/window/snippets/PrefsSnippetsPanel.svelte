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
	import { rowDef, type PrefsRowId } from '../search/prefsRows';
	import PrefsRow from '../rows/PrefsRow.svelte';
	import { m } from '$lib/paraglide/messages';

	const actions = $derived(commandPalette.actions);
	const root = $derived(actions?.isProject() && actions.isHostWorkspace() ? workspaceRoot.current : null);
	// a guest can still turn off the host's snippets for themselves
	const guest = $derived(!!actions && !actions.isHostWorkspace());

	const loaded = $derived(snippetStatus.loaded);
	const switches = $derived(snippetStatus.switches);

	function countOf(on: boolean, n: number | null, replaced = 0): string {
		if (!on) return m.prefs_snippets_off();
		if (n === null) return '';
		const count = n === 1 ? m.prefs_snippets_loaded_one() : m.prefs_snippets_loaded_other({ count: n });
		return replaced ? `${count}, ${m.prefs_snippets_replaced({ count: replaced })}` : count;
	}

	// what failed in one snippet file, the package files left to their own list
	function warningOf(layer: 'project' | 'global'): string {
		const own = snippetStatus.problems.filter((p) => p.layer === layer && !p.file);
		const whole = own.find((p) => p.whole);
		if (whole) return (whole.kept ? m.prefs_snippets_kept : m.prefs_snippets_not_loaded)({ reason: whole.reason });
		const failed = own.filter((p) => !p.warning).length;
		if (failed) return failed === 1 ? m.snippet_bar_failed_one() : m.snippet_bar_failed_other({ count: failed });
		if (!own.length) return '';
		return own.length === 1 ? m.snippet_bar_warned_one() : m.snippet_bar_warned_other({ count: own.length });
	}

	// a snippet file that did not load at all says so on its own row
	const entryProblems = $derived(snippetStatus.problems.filter((p) => !(p.whole && !p.file) && !p.warning));
	const warnings = $derived(snippetStatus.problems.filter((p) => p.warning));

	async function edit(file: Promise<string | null>): Promise<void> {
		const path = await file;
		if (!path || !actions) return;
		actions.openFile(path);
		preferencesOpen.current = false;
	}
</script>

{#snippet fileRow(
	id: PrefsRowId,
	count: string,
	warning: string,
	action: string,
	run: () => void,
	why: string,
	on: boolean,
	setOn: (on: boolean) => void,
	switchWhy: string = why
)}
	<PrefsRow {id}>
		<span class="flex items-center gap-3" use:unavailableTip={why} data-tip-anchor>
			<button type="button" class="btn preset-tonal btn-sm" disabled={!!why} onclick={run}>{action}</button>
			<Switch checked={on} disabled={!!switchWhy} onCheckedChange={(d) => setOn(d.checked)}>
				<Switch.Control><Switch.Thumb /></Switch.Control>
				<Switch.HiddenInput aria-label={rowDef(id).label()} />
			</Switch>
		</span>
		{#snippet below()}
			{#if warning}<p class="text-warning-ink text-xs leading-relaxed">{warning}</p>
			{:else if count}<p class="text-muted text-xs leading-relaxed">{count}</p>{/if}
		{/snippet}
	</PrefsRow>
{/snippet}

{@render fileRow(
	'snippets-folder',
	root || guest ? countOf(switches.folder, loaded.project) : '',
	(root || guest) && switches.folder ? warningOf('project') : '',
	m.prefs_snippets_edit(),
	() => void edit(root ? ensureProjectSnippets(root) : Promise.resolve(null)),
	root ? '' : guest ? m.unavailable_guest() : m.prefs_snippets_project_none(),
	switches.folder,
	(on) => {
		if (root || guest) setFolderSnippetsOn(root, on);
	},
	root || guest ? '' : m.prefs_snippets_project_none()
)}
{@render fileRow(
	'snippets-global',
	countOf(switches.global, loaded.global, loaded.globalReplaced),
	switches.global ? warningOf('global') : '',
	m.prefs_snippets_edit(),
	() => void edit(ensureGlobalSnippets()),
	!isDesktop() ? m.unavailable_desktop() : actions ? '' : m.prefs_snippets_global_none(),
	switches.global,
	setGlobalSnippetsOn
)}
{#if entryProblems.length}
	<h3 class="text-muted pt-4 pb-1 text-xs font-semibold tracking-wide uppercase">{m.prefs_snippets_problems()}</h3>
	<ul class="text-muted space-y-1 py-2 text-xs leading-relaxed">
		{#each entryProblems as problem, i (i)}
			<li>{describeSnippetProblem(problem)}</li>
		{/each}
	</ul>
{/if}
{#if warnings.length}
	<h3 class="text-muted pt-4 pb-1 text-xs font-semibold tracking-wide uppercase">{m.prefs_snippets_warnings()}</h3>
	<ul class="text-muted space-y-1 py-2 text-xs leading-relaxed">
		{#each warnings as problem, i (i)}
			<li>{describeSnippetProblem(problem)}</li>
		{/each}
	</ul>
{/if}
