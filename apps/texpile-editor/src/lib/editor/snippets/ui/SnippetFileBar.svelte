<script lang="ts">
	import { Braces, CircleAlert } from '@lucide/svelte';
	import EditorNotice from '$lib/components/EditorNotice.svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { openPreferencesAt } from '$lib/stores/dialogStore';
	import { problemsIn, snippetFileAt } from '../file/snippetFiles';
	import { describeSnippetProblem, snippetStatus } from '../file/snippetStatus.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { SnippetProblem } from '../file/snippetTypes';

	type Props = { path: string; root: string | null };
	const props: Props = $props();

	const file = $derived(snippetFileAt(props.path, props.root, snippetStatus.files));
	const problems = $derived(file ? problemsIn(file, snippetStatus.problems) : []);
	const title = $derived.by(() => {
		if (!file) return '';
		if (file.kind === 'package') return m.snippet_bar_package({ name: file.name });
		return file.layer === 'project' ? m.snippet_bar_project() : m.snippet_bar_global();
	});
	// the bar already names the file
	function inThisFile(p: SnippetProblem): string {
		return p.name ? `"${p.name}": ${p.reason}` : p.reason;
	}

	const warning = $derived.by(() => {
		if (!problems.length) return '';
		const whole = problems.find((p) => p.whole);
		if (whole) return `${whole.kept ? m.snippet_bar_kept() : m.snippet_bar_not_loaded()} ${whole.reason}`;
		const failed = problems.filter((p) => !p.warning);
		if (failed.length) {
			const count = failed.length === 1 ? m.snippet_bar_failed_one() : m.snippet_bar_failed_other({ count: failed.length });
			return `${count} ${inThisFile(failed[0])}`;
		}
		const count = problems.length === 1 ? m.snippet_bar_warned_one() : m.snippet_bar_warned_other({ count: problems.length });
		return `${count} ${inThisFile(problems[0])}`;
	});
	// the bar's text is muted, its buttons are not, or they read as disabled
	const BUTTON = 'btn btn-xs preset-outlined-surface-200-800 hover:preset-tonal text-surface-950-50 shrink-0';
	const help = $derived(`https://texpile.com/docs/snippets${file?.kind === 'package' ? '#package-files' : ''}`);
</script>

{#if file}
	<EditorNotice
		icon={warning ? CircleAlert : Braces}
		tone={warning ? 'warning' : 'info'}
		title={warning ? `${title}.` : title}
		note={warning}
	>
		{#if problems.length > 1}
			<button
				type="button"
				class={BUTTON}
				use:tip={problems.map(describeSnippetProblem).join('\n')}
				onclick={() => openPreferencesAt('snippets')}
			>
				{m.snippet_bar_show_all()}
			</button>
		{/if}
		<a class={BUTTON} href={help} target="_blank" rel="noopener noreferrer">{m.snippet_bar_docs()}</a>
	</EditorNotice>
{/if}
