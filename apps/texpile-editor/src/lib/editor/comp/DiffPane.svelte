<script lang="ts">
	// Git-diff view: the status/controls strip above DiffPanel.
	import { RefreshCw, GitCompare, X } from '@lucide/svelte';
	import DiffPanel from './DiffPanel.svelte';
	import { m } from '$lib/paraglide/messages';

	interface Props {
		filename: string;
		original: string;
		modified: string;
		layout: 'unified' | 'split';
		loading: boolean;
		error: string | null;
		hasHead: boolean;
		onToggleLayout: () => void;
		onRefresh: () => void;
		onExit: () => void;
	}
	let { filename, original, modified, layout, loading, error, hasHead, onToggleLayout, onRefresh, onExit }: Props = $props();
</script>

<div class="flex h-full flex-col">
	<div class="bg-surface-100-900 text-surface-600-300 border-surface-200-800 flex h-8 shrink-0 items-center gap-2 border-b px-3 text-xs">
		<GitCompare class="size-3.5 shrink-0" />
		<span class="font-medium">{m.wsview_diff_heading()}</span>
		{#if loading}<span class="text-surface-500">· {m.wsview_diff_loading()}</span>
		{:else if error}<span class="text-error-500 truncate">· {error}</span>
		{:else if !hasHead}<span class="text-surface-500">· {m.wsview_diff_new_file()}</span>{/if}
		<div class="ml-auto flex shrink-0 items-center gap-1">
			<button
				class="hover:preset-tonal rounded px-1.5 py-0.5"
				onclick={onToggleLayout}
				title={layout === 'unified' ? m.wsview_switch_to_side_by_side() : m.wsview_switch_to_inline()}
			>
				{layout === 'unified' ? m.wsview_side_by_side_label() : m.wsview_inline_label()}
			</button>
			<button
				class="hover:preset-tonal rounded p-0.5"
				onclick={onRefresh}
				title={m.wsview_refresh_diff()}
				aria-label={m.wsview_refresh_diff()}
			>
				<RefreshCw class="size-3.5" />
			</button>
			<button
				class="hover:preset-tonal-primary flex items-center gap-1 rounded px-1.5 py-0.5 font-medium"
				onclick={onExit}
				title={m.wsview_back_to_editor_title()}
			>
				<X class="size-3.5" />
				{m.wsview_close_label()}
			</button>
		</div>
	</div>
	<div class="min-h-0 flex-1 overflow-auto">
		{#key filename}
			<DiffPanel {filename} {original} {modified} {layout} />
		{/key}
	</div>
</div>
