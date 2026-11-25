<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { basename } from '$lib/workspace/fileSystem';
	import { mainFile } from '$lib/workspace/workspaceStore';
	import { problemsOpenFile, problemsView } from '../problemsStore.svelte';
	import CompileStatusLine from './CompileStatusLine.svelte';
	import ProblemFileGroup from './ProblemFileGroup.svelte';
	import ProblemFilters from './ProblemFilters.svelte';
	import ProblemRows from './ProblemRows.svelte';
	import ProblemSection from './ProblemSection.svelte';
	import ProjectNotice from './ProjectNotice.svelte';
	import ProofreadDocumentButton from './ProofreadDocumentButton.svelte';
	import ProofreadProgressLine from './ProofreadProgressLine.svelte';

	type Props = {
		root: string;
		onJump: (file: string, line: number, words?: string) => void;
		onShowAgent: () => void;
	};
	const props: Props = $props();
	const { root, onJump, onShowAgent } = $derived(props);

	const open = $derived(problemsOpenFile.current);
	const main = $derived(mainFile.current);
	const projectCount = $derived(problemsView.project.reduce((n, g) => n + g.problems.length, 0));
</script>

<div class="flex h-full min-h-0 flex-col text-xs">
	<div class="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1">
		<ProblemFilters />
		<div class="ml-auto flex items-center gap-2">
			<ProofreadDocumentButton />
			<CompileStatusLine />
		</div>
	</div>
	<div class="border-surface-200-800 border-b">
		<ProofreadProgressLine />
	</div>
	<div class="min-h-0 flex-1 [scrollbar-gutter:stable] overflow-y-auto pb-2">
		<ProblemSection
			title={m.problems_section_file()}
			detail={open ? basename(open) : undefined}
			count={problemsView.thisFile.length}
			open={!problemsView.folded.file}
			onToggle={() => (problemsView.folded.file = !problemsView.folded.file)}
		>
			{#if !open}
				<div class="text-muted px-6 py-1">{m.problems_no_open_file()}</div>
			{:else if problemsView.thisFile.length === 0}
				<div class="text-muted px-6 py-1">{m.problems_file_clean()}</div>
			{:else}
				<ProblemRows problems={problemsView.thisFile} {onJump} {onShowAgent} />
			{/if}
		</ProblemSection>
		<ProblemSection
			title={m.problems_section_project()}
			detail={main ? basename(main) : undefined}
			count={projectCount}
			open={!problemsView.folded.project}
			onToggle={() => (problemsView.folded.project = !problemsView.folded.project)}
		>
			<ProjectNotice />
			{#each problemsView.project as group (group.file ?? (group.outside ? 'outside' : ''))}
				<ProblemFileGroup {group} {root} {onJump} {onShowAgent} />
			{:else}
				{#if main}
					<div class="text-muted px-6 py-1">{m.problems_no_problems()}</div>
				{/if}
			{/each}
		</ProblemSection>
	</div>
</div>
