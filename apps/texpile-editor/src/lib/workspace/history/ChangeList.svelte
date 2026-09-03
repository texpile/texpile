<script lang="ts">
	// The changed files, in two groups of identical shape: what the author wrote, and what the
	// compiler wrote.
	//
	// There is no staged/unstaged split - what is ticked is what the next version records, so the
	// scope is visible rather than implied by which of two lists a row landed in. Build output starts
	// collapsed and unticked: a LaTeX project puts a dozen sidecars next to the source, and
	// committing them makes every later version's diff meaningless.
	import { tip } from '$lib/components/tooltip.svelte';
	import ChangeGroup from './ChangeGroup.svelte';
	import { pathLabels } from './pathLabels';
	import type { GitStatusEntry } from '$lib/workspace/git';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		root: string;
		/** what the author wrote */
		sources: GitStatusEntry[];
		/** what the compiler wrote */
		artifacts: GitStatusEntry[];
		selected: string[];
		onToggle: (path: string) => void;
		onOpenDiff: (path: string) => void;
		onDiscard: (changes: GitStatusEntry[]) => void;
		/** null while there is nothing to write, or no way to write it */
		onIgnoreArtifacts: (() => void) | null;
	};
	let { root, sources, artifacts, selected, onToggle, onOpenDiff, onDiscard, onIgnoreArtifacts }: Props = $props();

	let sourcesOpen = $state(true);
	let artifactsOpen = $state(false);

	const labels = $derived(pathLabels(root));
</script>

{#if sources.length}
	<ChangeGroup
		label={m.vcs_group_document()}
		entries={sources}
		{selected}
		open={sourcesOpen}
		onToggleOpen={() => (sourcesOpen = !sourcesOpen)}
		relPath={labels.relPath}
		baseName={labels.baseName}
		dirName={labels.dirName}
		{onToggle}
		{onOpenDiff}
		{onDiscard}
	/>
{/if}

{#if artifacts.length}
	<ChangeGroup
		label={m.vcs_build_output()}
		entries={artifacts}
		{selected}
		open={artifactsOpen}
		onToggleOpen={() => (artifactsOpen = !artifactsOpen)}
		relPath={labels.relPath}
		baseName={labels.baseName}
		dirName={labels.dirName}
		{onToggle}
		{onOpenDiff}
		{onDiscard}
	>
		{#snippet action()}
			{#if onIgnoreArtifacts}
				<!-- the permanent fix, one click: unticking these every time is a chore nobody should repeat -->
				<button
					class="hover:preset-tonal text-primary-500 shrink-0 rounded-base px-1 text-[11px] opacity-0 group-hover:opacity-100"
					use:tip={m.vcs_ignore_artifacts_title()}
					onclick={onIgnoreArtifacts}
				>
					{m.vcs_ignore_artifacts()}
				</button>
			{/if}
		{/snippet}
	</ChangeGroup>
{/if}
