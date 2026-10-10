<script lang="ts">
	import { Braces } from '@lucide/svelte';
	import EditorNotice from '$lib/components/EditorNotice.svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { openPreferencesAt } from '$lib/stores/dialogStore';
	import { problemsIn, snippetFileAt } from '../file/snippetFiles';
	import { describeSnippetProblem, snippetStatus } from '../file/snippetStatus.svelte';
	import { m } from '$lib/paraglide/messages';

	type Props = { path: string; root: string | null };
	const props: Props = $props();

	const file = $derived(snippetFileAt(props.path, props.root, snippetStatus.files));
	const skipped = $derived(file ? problemsIn(file, snippetStatus.problems) : []);
	const title = $derived.by(() => {
		if (!file) return '';
		if (file.kind === 'package') return m.snippet_bar_package({ name: file.name });
		return file.layer === 'project' ? m.snippet_bar_project() : m.snippet_bar_global();
	});
	const help = $derived(`https://texpile.com/docs/snippets${file?.kind === 'package' ? '#commands-of-other-packages' : ''}`);
</script>

{#if file}
	<EditorNotice icon={Braces} tone="info" {title} note="">
		{#if skipped.length}
			<button
				type="button"
				class="btn btn-xs hover:preset-tonal text-warning-ink shrink-0"
				use:tip={skipped.map(describeSnippetProblem).join('\n')}
				onclick={() => openPreferencesAt('snippets')}
			>
				{m.snippet_bar_skipped({ count: skipped.length })}
			</button>
		{/if}
		<a class="btn btn-xs hover:preset-tonal shrink-0" href={help} target="_blank" rel="noopener noreferrer">{m.snippet_bar_help()}</a>
	</EditorNotice>
{/if}
