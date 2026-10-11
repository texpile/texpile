<script lang="ts">
	import { ShieldQuestion } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages';
	import { tip } from '$lib/components/tooltip.svelte';
	import { snippetStatus } from '$lib/editor/snippets/file/snippetStatus.svelte';
	import { allowProjectSnippetPatterns } from '$lib/editor/snippets/file/snippetLoader';

	// null for a guest, whose yes is not kept with a folder
	type Props = { root: string | null };
	const props: Props = $props();
	const pending = $derived(snippetStatus.pendingPatterns);
	const patterns = $derived(pending?.split('\n') ?? []);
</script>

{#if pending}
	<!-- a cloned project's patterns run on every keystroke, so they wait for a yes like its compile command -->
	<div class="border-warning-wash bg-warning-tint flex shrink-0 items-center gap-2 border-b px-3 py-2 text-xs">
		<ShieldQuestion class="text-warning-ink size-4 shrink-0" />
		<span class="cap-center min-w-0 flex-1 truncate" use:tip={`${m.snippets_patterns_prompt()} ${m.snippets_patterns_why()}`}>
			{m.snippets_patterns_prompt()} <span class="text-muted">{m.snippets_patterns_why()}</span>
		</span>
		<!-- one yes covers them all, so every one is a hover away -->
		<span class="flex shrink-0 items-center gap-1" use:tip={pending}>
			<code class="bg-surface-200-800 rounded-base max-w-48 truncate px-1.5 py-0.5 font-mono">{patterns[0]}</code>
			{#if patterns.length > 1}<span class="text-muted">+{patterns.length - 1}</span>{/if}
		</span>
		<button class="btn btn-xs preset-filled-primary-500 shrink-0" onclick={() => allowProjectSnippetPatterns(props.root, pending)}>
			{m.snippets_patterns_allow()}
		</button>
	</div>
{/if}
