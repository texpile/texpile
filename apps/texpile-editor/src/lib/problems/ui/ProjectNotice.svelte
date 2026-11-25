<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { basename, samePath } from '$lib/workspace/fileSystem';
	import { mainFile } from '$lib/workspace/workspaceStore';
	import { mainCandidate, mainDocument } from '../sources/mainDocument.svelte';
	import { problemsOpenFile, setMainFileFromProblems } from '../problemsStore.svelte';

	const open = $derived(problemsOpenFile.current);
	const main = $derived(mainFile.current);
	const outsideMain = $derived(!!main && !!open && !!mainDocument.current && !mainDocument.current.files.some((f) => samePath(f, open)));
	const candidate = $derived(mainCandidate.current);
	const setMain = $derived(setMainFileFromProblems.current);
</script>

{#if !main}
	<div class="flex items-center gap-2 px-6 py-1">
		<span class="cap-center min-w-0 flex-1">{m.problems_needs_main()}</span>
		{#if candidate && setMain}
			<button class="btn btn-sm preset-tonal shrink-0 px-3" onclick={() => void setMain(candidate)}>
				{m.problems_set_main({ file: basename(candidate) })}
			</button>
		{/if}
	</div>
{:else if outsideMain}
	<div class="text-muted px-6 py-1">{m.problems_not_in_main({ file: basename(main) })}</div>
{/if}
