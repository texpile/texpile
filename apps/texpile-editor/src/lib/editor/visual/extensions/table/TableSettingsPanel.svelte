<script lang="ts">
	import { tip } from '$lib/components/tooltip.svelte';
	import { Switch } from '@skeletonlabs/skeleton-svelte';
	import { ChevronDown, Info, AlignLeft, AlignCenter, AlignRight, WrapText, StretchHorizontal } from '@lucide/svelte';
	import type { Node } from 'prosemirror-model';
	import TableAdvancedSection from './TableAdvancedSection.svelte';
	import { templateFeaturesStore } from '$lib/stores/editorStore';
	import { parseColspec, generateColspec, type ColAlign } from '$lib/languages/latex/parser/colspec';
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
		setColspec
	}: Props = $props();

	const ALIGN_ICONS = [
		{ value: 'l' as ColAlign, icon: AlignLeft, title: m.tablewrap_align_left() },
		{ value: 'c' as ColAlign, icon: AlignCenter, title: m.tablewrap_align_center() },
		{ value: 'r' as ColAlign, icon: AlignRight, title: m.tablewrap_align_right() },
		{ value: 'p' as ColAlign, icon: WrapText, title: m.tablewrap_align_paragraph() },
		{ value: 'X' as ColAlign, icon: StretchHorizontal, title: m.tablewrap_align_stretch(), tabularx: true }
	];
	// columns the table actually has (first row's colspans summed)
	const columnCount = $derived.by(() => {
		let table: Node | null = null;
		node.forEach((c) => {
			if (c.type.name === 'table') table = c as Node;
		});
		if (!table || (table as Node).childCount === 0) return 0;
		let w = 0;
		(table as Node).child(0).forEach((cell) => (w += Number(cell.attrs.colspan ?? 1)));
		return w;
	});
	const isTabularx = $derived(tableEnv === 'tabularx' || tableEnv === 'tabulary');
	// the captured spec, or a default (all centred) for editor-created tables
	const effectiveColspec = $derived(colspec && colspec.trim() ? colspec : 'c'.repeat(columnCount));
	const colModel = $derived(parseColspec(effectiveColspec));
	const verticalLines = $derived(!!colModel && colModel.rules.length > 1 && colModel.rules.every(Boolean));

	// p/m/b all read as the paragraph icon; C reads as the X icon
	function activeAlign(a: ColAlign): ColAlign {
		return a === 'm' || a === 'b' ? 'p' : a === 'C' ? 'X' : a;
	}

	function setAlign(i: number, align: ColAlign) {
		if (!colModel) return;
		const columns = colModel.columns.map((c, j) => {
			if (j !== i) return c;
			const isPara = align === 'p' || align === 'm' || align === 'b';
			return { align, width: isPara ? (c.width ?? '2cm') : undefined };
		});
		setColspec(generateColspec({ ...colModel, columns }));
	}
	function setWidth(i: number, width: string) {
		if (!colModel) return;
		const columns = colModel.columns.map((c, j) => (j === i ? { ...c, width } : c));
		setColspec(generateColspec({ ...colModel, columns }));
	}
	function setVerticalLines(on: boolean) {
		if (!colModel) return;
		setColspec(generateColspec({ columns: colModel.columns, rules: colModel.rules.map(() => on) }));
	}

	// notes and table* are LaTeX constructs; the typst serializer has nowhere to put them
	const tableNotesEnabled = $derived(dialect === 'latex' && (templateFeaturesStore.current?.tableNotes ?? true));
	const columnSpanningEnabled = $derived(dialect === 'latex' && (templateFeaturesStore.current?.columnSpanningFigures ?? false));

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
	{#if dialect === 'latex' && colModel && colModel.columns.length > 0}
		<div class="settings-row">
			<div class="text-muted mb-1.5 text-xs font-semibold">{m.tablewrap_columns_heading()}</div>
			{#each colModel.columns as col, i (i)}
				<div class="mb-1 flex items-center gap-2">
					<span class="text-faint w-4 text-right text-xs">{i + 1}</span>
					<div class="border-surface-300-700 flex overflow-hidden rounded-container border">
						{#each ALIGN_ICONS as opt (opt.value)}
							{#if !opt.tabularx || isTabularx}
								<button
									type="button"
									use:tip={opt.title}
									aria-label={opt.title}
									class="hover:preset-tonal p-1 {activeAlign(col.align) === opt.value ? 'preset-filled-primary-500' : ''}"
									onclick={() => setAlign(i, opt.value)}
								>
									<opt.icon class="size-3.5" />
								</button>
							{/if}
						{/each}
					</div>
					{#if col.align === 'p' || col.align === 'm' || col.align === 'b'}
						<input
							class="input w-16 px-1.5 py-0.5 text-xs"
							value={col.width ?? ''}
							placeholder="3cm"
							aria-label={m.tablewrap_column_width_aria({ index: i + 1 })}
							onchange={(e) => setWidth(i, (e.currentTarget as HTMLInputElement).value)}
						/>
					{/if}
				</div>
			{/each}
			<Switch
				checked={verticalLines}
				onCheckedChange={(e) => setVerticalLines(e.checked)}
				class="mt-2 flex items-center justify-between gap-3"
			>
				<Switch.Label>{m.tablewrap_vertical_lines()}</Switch.Label>
				<Switch.Control class="preset-filled-surface-200-800 data-[state=checked]:preset-filled-primary-500"
					><Switch.Thumb /></Switch.Control
				>
				<Switch.HiddenInput />
			</Switch>
			<hr class="border-surface-200-800 mt-3" />
		</div>
	{:else if colspec && colspec.trim()}
		<!-- spec too exotic to model visually: edit the verbatim string -->
		<div class="settings-row">
			<div class="text-muted mb-1.5 text-xs font-semibold">{m.tablewrap_column_spec()}</div>
			<input
				class="input w-full px-1.5 py-0.5 text-xs"
				value={colspec}
				aria-label={m.tablewrap_column_spec()}
				onchange={(e) => setColspec((e.currentTarget as HTMLInputElement).value)}
			/>
			<div class="text-faint mt-1 text-xs">{m.tablewrap_column_spec_hint()}</div>
			<hr class="border-surface-200-800 mt-3" />
		</div>
	{/if}
	{#if dialect === 'latex'}
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

	{#if columnSpanningEnabled}
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
