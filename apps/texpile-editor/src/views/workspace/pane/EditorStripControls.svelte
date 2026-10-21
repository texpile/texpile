<script lang="ts">
	// one editor's own controls, at the end of its tab strip: Open Changes while its file has some, and its
	// visual/source toggle. On an editor without focus they stay a click away, with the current mode in gray
	import { ChevronDown, Code, Eye, GitCompare } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import MenuDropdown from '$lib/menus/MenuDropdown.svelte';
	import { scmHandlers } from '$lib/workspace/scm/actions/scmHandlers.svelte';
	import { gitChanges } from '$lib/workspace/scm/gitStore';
	import { samePath } from '$lib/workspace/fileSystem';
	import { editorGroups } from '$lib/workspace/groups/editorGroups.svelte';
	import type { FileKind } from '$lib/workspace/documentBuffer.svelte';
	import type { ViewMode } from '$lib/workspace/viewModeSwitch.svelte';
	import { m } from '$lib/paraglide/messages';
	import { hasViewToggle } from './viewToggle';

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
		/** in the title bar: the toggle is a dropdown naming the mode, unboxed like the bar's other controls */
		compact?: boolean;
	};
	const props: Props = $props();
	const path = $derived(props.loadedPath);
	// saved in a version before, and different now: a new file has nothing to compare against
	const changed = $derived(
		!props.guest && !!path && gitChanges.current.some((c) => c.x !== '?' && !c.files && samePath(c.path, path ?? ''))
	);
	const toggles = $derived(hasViewToggle(path, props.kind, props.guest));
	const on = $derived(props.parked ? 'preset-tonal' : 'preset-filled-primary-500');
	const visualOff = $derived(props.encodingIssue ?? (props.conflicted ? m.vcs_conflict_visual_off() : null));
	// a file the visual editor cannot open shows as source, whatever mode was picked
	const shown = $derived(visualOff && props.viewMode === 'visual' ? 'source' : props.viewMode);
	const modeTip = $derived(
		shown === 'visual'
			? m.wsview_visual_editor_title()
			: props.kind === 'typ'
				? m.wsview_typst_source_title()
				: m.wsview_latex_source_title()
	);
	const modes = $derived([
		{
			options: [
				{
					value: 'visual',
					label: m.wsview_visual_label(),
					icon: Eye,
					checked: shown === 'visual',
					note: visualOff ?? undefined,
					disabled: !!visualOff
				},
				{ value: 'source', label: m.wsview_source_label(), icon: Code, checked: shown === 'source' }
			]
		}
	]);

	function compare(): void {
		const file = path;
		if (!file) return;
		// the comparison opens in this editor
		if (props.parked && props.groupId !== undefined) editorGroups.focusThen(props.groupId, () => scmHandlers.current?.compare(file));
		else scmHandlers.current?.compare(file);
	}
</script>

<!-- data-strip-controls: a click here acts on this editor without taking focus from the one being typed in -->
<div
	class="flex shrink-0 items-center gap-1.5 {props.compact ? '' : 'pl-2'}"
	data-strip-controls
	onmousedown={(e) => e.preventDefault()}
	role="presentation"
>
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
	{#if toggles && props.compact}
		<!-- a dropdown naming the mode: two buttons outweighed the menus across the bar -->
		<MenuDropdown groups={modes} placement="bottom-end" onSelect={(v) => props.onSetViewMode?.(v as 'visual' | 'source')}>
			{#snippet trigger(attrs)}
				<button {...attrs} class="title-bar-button gap-1" aria-label={modeTip} use:tip={modeTip}>
					{#if shown === 'source'}<Code class="size-3.5" />{:else}<Eye class="size-3.5" />{/if}
					<!-- as wide as the wider name, so the bar does not shift on a switch -->
					<span class="cap-center grid">
						<span class="invisible col-start-1 row-start-1" aria-hidden="true">{m.wsview_visual_label()}</span>
						<span class="invisible col-start-1 row-start-1" aria-hidden="true">{m.wsview_source_label()}</span>
						<span class="col-start-1 row-start-1">
							{shown === 'source' ? m.wsview_source_label() : m.wsview_visual_label()}
						</span>
					</span>
					<ChevronDown class="size-3 opacity-60" />
				</button>
			{/snippet}
		</MenuDropdown>
	{:else if toggles}
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
