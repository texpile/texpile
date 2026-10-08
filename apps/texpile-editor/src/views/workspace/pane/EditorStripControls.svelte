<script lang="ts">
	// one editor's own controls, at the end of its tab strip: Open Changes while its file has some, and its
	// visual/source toggle. On an editor without focus they stay a click away, with the current mode in gray
	import { Code, Eye, GitCompare } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { scmHandlers } from '$lib/workspace/scm/actions/scmHandlers.svelte';
	import { gitChanges } from '$lib/workspace/scm/gitStore';
	import { samePath } from '$lib/workspace/fileSystem';
	import { editorGroups } from '$lib/workspace/groups/editorGroups.svelte';
	import type { FileKind } from '$lib/workspace/documentBuffer.svelte';
	import type { ViewMode } from '$lib/workspace/viewModeSwitch.svelte';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		loadedPath: string | null;
		kind: FileKind;
		viewMode: ViewMode;
		encodingIssue?: string | null;
		conflicted?: boolean;
		guest: boolean;
		/** not the focused editor */
		parked: boolean;
		groupId?: number;
		onSetViewMode?: (mode: 'visual' | 'source') => void;
	};
	const props: Props = $props();
	const path = $derived(props.loadedPath);
	// saved in a version before, and different now: a new file has nothing to compare against
	const changed = $derived(
		!props.guest && !!path && gitChanges.current.some((c) => c.x !== '?' && !c.files && samePath(c.path, path ?? ''))
	);
	// for .bib it is the reference editor against raw BibTeX, which only the host has
	const toggles = $derived(
		!!path && (props.kind === 'tex' || props.kind === 'md' || props.kind === 'typ' || (props.kind === 'bib' && !props.guest))
	);
	const on = $derived(props.parked ? 'preset-tonal' : 'preset-filled-primary-500');

	function compare(): void {
		const file = path;
		if (!file) return;
		// the comparison opens in this editor
		if (props.parked && props.groupId !== undefined) editorGroups.focusThen(props.groupId, () => scmHandlers.current?.compare(file));
		else scmHandlers.current?.compare(file);
	}
</script>

<!-- data-strip-controls: a click here acts on this editor without taking focus from the one being typed in -->
<div class="flex shrink-0 items-center gap-1.5 pl-2" data-strip-controls onmousedown={(e) => e.preventDefault()} role="presentation">
	{#if changed && scmHandlers.current}
		<!-- as VS Code's Open Changes in the editor title: only while there is something to compare -->
		<button
			class="btn btn-xs preset-outlined-surface-200-800 bg-surface-50-950 hover:preset-tonal"
			onclick={compare}
			use:tip={m.wsview_compare_last()}
			aria-label={m.wsview_compare_last()}
		>
			<span class="flex h-[1lh] items-center"><GitCompare class="size-3.5" /></span>
		</button>
	{/if}
	{#if toggles}
		<div class="border-surface-300-700 rounded-base bg-surface-50-950 inline-grid shrink-0 grid-cols-2 overflow-hidden border text-xs">
			<button
				class="flex items-center justify-center gap-1 px-2 py-0.5 disabled:cursor-not-allowed disabled:opacity-40 {props.viewMode ===
				'visual'
					? on
					: 'hover:preset-tonal disabled:hover:bg-transparent'}"
				onclick={() => props.onSetViewMode?.('visual')}
				aria-label={m.wsview_visual_label()}
				aria-pressed={props.viewMode === 'visual'}
				disabled={!!props.encodingIssue || props.conflicted}
				use:tip={props.encodingIssue ?? (props.conflicted ? m.vcs_conflict_visual_off() : m.wsview_visual_editor_title())}
			>
				<Eye class="size-3.5" />
				<span class="cap-center @max-[32rem]/strip:hidden">{m.wsview_visual_label()}</span>
			</button>
			<button
				class="flex items-center justify-center gap-1 px-2 py-0.5 {props.viewMode === 'source' ? on : 'hover:preset-tonal'}"
				onclick={() => props.onSetViewMode?.('source')}
				aria-label={m.wsview_source_label()}
				aria-pressed={props.viewMode === 'source'}
				use:tip={props.kind === 'typ' ? m.wsview_typst_source_title() : m.wsview_latex_source_title()}
			>
				<Code class="size-3.5" />
				<span class="cap-center @max-[32rem]/strip:hidden">{m.wsview_source_label()}</span>
			</button>
		</div>
	{/if}
</div>
