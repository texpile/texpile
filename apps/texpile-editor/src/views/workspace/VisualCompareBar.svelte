<script lang="ts">
	// the bar over a visual comparison
	import { tip } from '$lib/components/tooltip.svelte';
	import { GitCompare, RefreshCw, ChevronUp, ChevronDown } from '@lucide/svelte';
	import { editorViewStore } from '$lib/stores/editorStore';
	import { stepVisualDiff } from '$lib/editor/visual/diff/stepVisualDiff';
	import type { CompareRef } from '$lib/workspace/tabs.svelte';
	import type { Snippet } from 'svelte';
	import { m } from '$lib/paraglide/messages';

	type VisualCompareBarProps = {
		compare: CompareRef | null;
		fileDeleted: boolean;
		versionParsing: boolean;
		versionUnavailable: boolean;
		/** the version's preamble differs, which only the source comparison shows */
		sourceOnly: boolean;
		onRefresh: () => void;
		/** what this comparison offers besides stepping through it, at the bar's end (Version History's Restore) */
		actions?: Snippet;
	};

	const props: VisualCompareBarProps = $props();

	const STEPS = [
		[-1, ChevronUp, () => m.wsview_diff_previous()],
		[1, ChevronDown, () => m.wsview_diff_next()]
	] as const;

	function step(dir: 1 | -1) {
		const view = editorViewStore.current;
		if (view) stepVisualDiff(view, dir);
	}
</script>

<!-- the rule is an inset shadow, as under the source comparison's bar (diff/DiffPane.svelte) -->
<div class="bg-surface-50-900 text-muted line-under flex min-h-10 shrink-0 items-center gap-2 px-3 text-xs">
	<GitCompare class="size-3.5 shrink-0" />
	<span class="cap-center shrink-0 font-medium whitespace-nowrap">{m.wsview_diff_since()}</span>
	{#if props.compare}<span class="cap-center text-muted min-w-0 truncate" use:tip={props.compare.hash}>· {props.compare.subject}</span>{/if}
	<!-- What it cannot show, said out loud: an unmarked document otherwise reads as "nothing
	     changed". No count - the number would be of source runs, which nothing on screen shows. -->
	{#if props.fileDeleted}
		<span class="cap-center text-muted min-w-0 truncate">· {m.wsview_diff_file_deleted()}</span>
	{:else if props.versionParsing}
		<!-- a parse that lands quickly should flash nothing at all; see lateReveal.ts -->
		<span class="cap-center text-muted reveal-late min-w-0 truncate">· {m.wsview_diff_finding_changes()}</span>
	{:else if props.versionUnavailable}
		<span class="cap-center text-muted min-w-0 truncate">· {m.wsview_diff_version_unparsed()}</span>
	{:else if props.sourceOnly}
		<span class="cap-center text-muted min-w-0 truncate">· {m.wsview_diff_source_only()}</span>
	{/if}
	<div class="ml-auto flex shrink-0 items-center gap-1">
		<!-- through the marked changes from the caret, wrapping round -->
		{#each STEPS as [dir, Icon, label] (dir)}
			<button class="btn-icon btn-icon-xs hover:preset-tonal" onclick={() => step(dir)} use:tip={label()} aria-label={label()}>
				<Icon class="size-3.5" />
			</button>
		{/each}
		<button
			class="btn-icon btn-icon-xs hover:preset-tonal"
			onclick={props.onRefresh}
			use:tip={m.wsview_refresh_diff()}
			aria-label={m.wsview_refresh_diff()}
		>
			<RefreshCw class="size-3.5" />
		</button>
		{@render props.actions?.()}
	</div>
</div>
