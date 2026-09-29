<script lang="ts">
	// The changed files, in two groups of identical shape: what the author wrote, and what the
	// compiler wrote.
	//
	// There is no staged/unstaged split - what is ticked is what the next version records, so the
	// scope is visible rather than implied by which of two lists a row landed in. Build output starts
	// collapsed and unticked: a LaTeX project puts a dozen sidecars next to the source, and
	// committing them makes every later version's diff meaningless.
	import { tip } from '$lib/components/tooltip.svelte';
	import { EyeOff } from '@lucide/svelte';
	import ChangeGroup from './ChangeGroup.svelte';
	import { pathLabels } from './pathLabels';
	import { MENU_TRIGGER, hoverAction } from './rowMenu';
	import type { GitStatusEntry } from '$lib/workspace/scm/git';
	import { gitWriting } from '$lib/workspace/scm/gitStore';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		root: string;
		/** files both sides changed, holding conflict markers: shown first, and never ticked */
		conflicts?: GitStatusEntry[];
		/** what the author wrote */
		sources: GitStatusEntry[];
		/** what the compiler wrote */
		artifacts: GitStatusEntry[];
		selected: string[];
		onToggle: (path: string) => void;
		onOpenDiff: (path: string) => void;
		/** a file both sides changed, in the source editor at its first marked place */
		onOpenConflict?: (path: string) => void;
		onDiscard: (changes: GitStatusEntry[]) => void;
		/** null while there is nothing to write, or no way to write it */
		onIgnoreArtifacts: (() => void) | null;
	};
	let {
		root,
		conflicts = [],
		sources,
		artifacts,
		selected,
		onToggle,
		onOpenDiff,
		onOpenConflict,
		onDiscard,
		onIgnoreArtifacts
	}: Props = $props();

	let conflictsOpen = $state(true);
	let sourcesOpen = $state(true);
	let artifactsOpen = $state(false);

	const labels = $derived(pathLabels(root));
</script>

{#if conflicts.length}
	<!-- Both sides changed these and git could not combine them: until someone chooses, the file
	     holds both versions between conflict markers, which no ordinary version should record -->
	<ChangeGroup
		label={m.vcs_group_conflicts()}
		entries={conflicts}
		{selected}
		locked
		open={conflictsOpen}
		onToggleOpen={() => (conflictsOpen = !conflictsOpen)}
		relPath={labels.relPath}
		baseName={labels.baseName}
		dirName={labels.dirName}
		{onToggle}
		{onOpenDiff}
		onOpen={onOpenConflict}
		{onDiscard}
	/>
{/if}

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
				<!-- the permanent fix, one click: unticking these every time is a chore nobody should repeat.
				     The rows' own hover button, with the icon a row's Add to .gitignore carries. -->
				<button
					class="{MENU_TRIGGER} {hoverAction()} disabled:opacity-50"
					use:tip={m.vcs_ignore_artifacts_title()}
					aria-label={m.vcs_ignore_artifacts()}
					onclick={onIgnoreArtifacts}
					disabled={gitWriting.current}
				>
					<EyeOff class="size-3.5" />
				</button>
			{/if}
		{/snippet}
	</ChangeGroup>
{/if}
