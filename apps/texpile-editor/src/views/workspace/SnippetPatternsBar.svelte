<script lang="ts">
	import { ShieldQuestion } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages';
	import { tip } from '$lib/components/tooltip.svelte';
	import { snippetStatus } from '$lib/editor/snippets/file/snippetStatus.svelte';
	import { allowProjectSnippetPatterns } from '$lib/editor/snippets/file/snippetLoader';

	type Props = { root: string };
	const props: Props = $props();
	const pending = $derived(snippetStatus.pendingPatterns);
</script>

{#if pending}
	<!-- the snippet file's patterns run on every keystroke, so a cloned project's wait for a yes, as its compile command does -->
	<div class="border-warning-wash bg-warning-tint flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b px-3 py-2 text-xs">
		<ShieldQuestion class="text-warning-ink size-4 shrink-0" />
		<span>{m.snippets_patterns_prompt({ count: pending.split('\n').length })}</span>
		<code class="bg-surface-200-800 rounded-base min-w-0 truncate px-1.5 py-0.5 font-mono" use:tip={pending}>{pending.split('\n')[0]}</code>
		<span class="text-muted" use:tip={m.snippets_patterns_why()}>({m.snippets_patterns_why()})</span>
		<div class="ml-auto flex shrink-0 items-center gap-1">
			<button class="btn btn-xs preset-filled-primary-500" onclick={() => allowProjectSnippetPatterns(props.root, pending)}>
				{m.snippets_patterns_allow()}
			</button>
		</div>
	</div>
{/if}
