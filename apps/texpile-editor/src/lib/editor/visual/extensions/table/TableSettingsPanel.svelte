<script lang="ts">
	import { tip } from '$lib/components/tooltip.svelte';
	import { Switch } from '@skeletonlabs/skeleton-svelte';
	import { ChevronDown, Info } from '@lucide/svelte';
	import type { Node } from 'prosemirror-model';
	import TableAdvancedSection from './TableAdvancedSection.svelte';
	import LatexColumnsSetting from './columns/LatexColumnsSetting.svelte';
	import TypstColumnsSetting from './columns/TypstColumnsSetting.svelte';
	import TableLinesSetting from './rules/TableLinesSetting.svelte';
	import type { TableLines } from './rules/tableRules';
	import { templateFeaturesStore } from '$lib/stores/editorStore';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		/** the popover's open state; the label is validated when it closes */
		open: boolean;
		dialect: 'latex' | 'typst';
		node: Node;
		updateAttrs: (attrs: Partial<typeof node.attrs>) => void;
		checkDuplicate: (label: string) => boolean;
		rowRules: string[];
		bottomRule: string;
		setRowRule: (rowIndex: number, rule: string) => void;
		setBottomRule: (rule: string) => void;
		colspec: string;
		tableEnv: string;
		setColspec: (spec: string) => void;
		setAlign: (align: string | null) => void;
		lines: TableLines | null;
		setLines: (lines: TableLines) => void;
		dropCaption: () => void;
	};

	let {
		open,
		dialect,
		node,
		updateAttrs,
		checkDuplicate,
		rowRules,
		bottomRule,
		setRowRule,
		setBottomRule,
		colspec,
		tableEnv,
		setColspec,
		setAlign,
		lines,
		setLines,
		dropCaption
	}: Props = $props();

	// the wrapper's table, whose columns the settings edit
	const table = $derived.by(() => {
		let found: Node | null = null;
		node.forEach((c) => {
			if (c.type.name === 'table') found = c;
		});
		return found as Node | null;
	});

	// notes and table* are LaTeX constructs; the typst serializer has nowhere to put them
	const tableNotesEnabled = $derived(dialect === 'latex' && (templateFeaturesStore.current?.tableNotes ?? true));
	const columnSpanningEnabled = $derived(dialect === 'latex' && (templateFeaturesStore.current?.columnSpanningFigures ?? false));
	const isFloat = $derived(tableEnv !== 'longtable');

	let showAdvanced = $state(false);

	// first-paint snapshot by design, re-synced by the $effect below when the node prop changes
	// svelte-ignore state_referenced_locally
	const initialAttrs = node?.attrs;
	let showNotesInput = $state(initialAttrs?.showNotes || false);
	let spanningInput = $state(initialAttrs?.spanning || false);

	// re-sync when the node changes externally
	$effect(() => {
		showNotesInput = node?.attrs?.showNotes || false;
		spanningInput = node?.attrs?.spanning || false;
	});

	function handleNotesToggle(details: { checked: boolean }) {
		showNotesInput = details.checked;
		updateAttrs({ showNotes: details.checked });
	}

	function handleSpanningToggle(details: { checked: boolean }) {
		spanningInput = details.checked;
		updateAttrs({ spanning: details.checked });
	}
</script>

<div class="settings-content">
	<TableLinesSetting {lines} {setLines} />
	{#if dialect === 'typst'}
		<!-- a figure centers what it holds -->
		<TypstColumnsSetting {table} {colspec} {setColspec} inherited="center" {setAlign} />
	{:else}
		<LatexColumnsSetting {table} {colspec} {tableEnv} {setColspec} />
	{/if}
	{#if dialect === 'typst' || isFloat}
		<div class="settings-row">
			<!-- on is what a float is; off leaves the table of its own, centered as the float printed it -->
			<Switch checked onCheckedChange={dropCaption} class="flex items-center justify-between gap-3">
				<Switch.Label>{m.tablewrap_caption_and_number()}</Switch.Label>
				<Switch.Control class="preset-filled-surface-200-800 data-[state=checked]:preset-filled-primary-500">
					<Switch.Thumb />
				</Switch.Control>
				<Switch.HiddenInput />
			</Switch>
		</div>
	{/if}
	{#if dialect === 'latex' && isFloat}
		<div class="settings-row">
			{#if tableNotesEnabled}
				<Switch checked={showNotesInput} onCheckedChange={handleNotesToggle} class="flex items-center justify-between gap-3">
					<Switch.Label>{m.tablewrap_show_notes()}</Switch.Label>
					<Switch.Control class="preset-filled-surface-200-800 data-[state=checked]:preset-filled-primary-500">
						<Switch.Thumb />
					</Switch.Control>
					<Switch.HiddenInput />
				</Switch>
			{:else}
				<div class="w-full" use:tip={m.tablewrap_notes_disabled_tooltip()}>
					<Switch checked={false} disabled class="flex cursor-not-allowed items-center justify-between gap-3 opacity-50">
						<Switch.Label>{m.tablewrap_show_notes()}</Switch.Label>
						<Switch.Control class="preset-filled-surface-200-800">
							<Switch.Thumb />
						</Switch.Control>
						<Switch.HiddenInput />
					</Switch>
				</div>
			{/if}
		</div>
	{/if}

	{#if columnSpanningEnabled && isFloat}
		<div class="settings-row">
			<Switch checked={spanningInput} onCheckedChange={handleSpanningToggle} class="flex items-center justify-between gap-3">
				<Switch.Label class="flex items-center gap-2">
					{m.tablewrap_span_columns()}
					<button type="button" class="inline-flex items-center" use:tip={m.tablewrap_span_columns_tooltip()}>
						<Info class="text-muted h-3.5 w-3.5" />
					</button>
				</Switch.Label>
				<Switch.Control class="preset-filled-surface-200-800 data-[state=checked]:preset-filled-primary-500">
					<Switch.Thumb />
				</Switch.Control>
				<Switch.HiddenInput />
			</Switch>
		</div>
	{/if}

	<button
		type="button"
		class="text-muted hover:text-surface-900-100 my-3 flex w-full items-center gap-2 text-sm transition-colors"
		onclick={() => (showAdvanced = !showAdvanced)}
	>
		<ChevronDown class="h-4 w-4 transition-transform {showAdvanced ? 'rotate-180' : ''}" />
		<span>{m.tablewrap_advanced_options()}</span>
	</button>

	{#if showAdvanced}
		<TableAdvancedSection {open} {dialect} {node} {updateAttrs} {checkDuplicate} {rowRules} {bottomRule} {setRowRule} {setBottomRule} />
	{/if}
</div>

<style>
	.settings-content {
		padding: calc(var(--spacing) * 3);
	}

	.settings-row {
		margin-bottom: calc(var(--spacing) * 3);
	}

	.settings-row:last-child {
		margin-bottom: 0;
	}
</style>
