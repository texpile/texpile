<script lang="ts">
	// a table's columns: each one's alignment and the vertical lines in LaTeX, the columns value as written in Typst
	import { tip } from '$lib/components/tooltip.svelte';
	import { Switch } from '@skeletonlabs/skeleton-svelte';
	import { AlignLeft, AlignCenter, AlignRight, WrapText, StretchHorizontal } from '@lucide/svelte';
	import type { Node } from 'prosemirror-model';
	import { parseColspec, generateColspec, type ColspecColumn } from '$lib/languages/latex/parser/colspec';
	import { columnTypeWorksIn } from '$lib/languages/latex/knowledge/registries/columnTypes';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		dialect: 'latex' | 'typst';
		table: Node | null;
		colspec: string;
		tableEnv: string;
		setColspec: (spec: string) => void;
	};

	let { dialect, table, colspec, tableEnv, setColspec }: Props = $props();

	const ALIGN_ICONS = [
		{ value: 'l', icon: AlignLeft, title: m.tablewrap_align_left() },
		{ value: 'c', icon: AlignCenter, title: m.tablewrap_align_center() },
		{ value: 'r', icon: AlignRight, title: m.tablewrap_align_right() },
		{ value: 'p', icon: WrapText, title: m.tablewrap_align_paragraph() },
		{ value: 'X', icon: StretchHorizontal, title: m.tablewrap_align_stretch() }
	];
	// columns the table actually has (first row's colspans summed)
	const columnCount = $derived.by(() => {
		if (!table || table.childCount === 0) return 0;
		let w = 0;
		table.child(0).forEach((cell) => (w += Number(cell.attrs.colspan ?? 1)));
		return w;
	});
	// the captured spec, or what the serializer writes for an editor-created table: centred and
	// ruled. Guessing an unruled one here left the border toggle reading off for every new table
	const effectiveColspec = $derived(colspec && colspec.trim() ? colspec : columnCount > 0 ? `|${'c|'.repeat(columnCount)}` : '');
	const colModel = $derived(parseColspec(effectiveColspec));
	const verticalLines = $derived(!!colModel && colModel.rules.length > 1 && colModel.rules.every(Boolean));

	// every column with a width (p, m, b) reads as the paragraph icon
	function activeAlign(c: ColspecColumn): string {
		return c.width === undefined ? c.align : 'p';
	}

	function setAlign(i: number, align: string) {
		if (!colModel) return;
		const columns = colModel.columns.map((c, j) => (j === i ? { align, width: align === 'p' ? (c.width ?? '2cm') : undefined } : c));
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
</script>

{#if dialect === 'latex' && colModel && colModel.columns.length > 0}
	<div class="mb-3">
		<div class="text-muted mb-1.5 text-xs font-semibold">{m.tablewrap_columns_heading()}</div>
		{#each colModel.columns as col, i (i)}
			<div class="mb-1 flex items-center gap-2">
				<span class="text-faint w-4 text-right text-xs">{i + 1}</span>
				<div class="border-surface-300-700 rounded-container flex overflow-hidden border">
					{#each ALIGN_ICONS as opt (opt.value)}
						{#if columnTypeWorksIn(opt.value, tableEnv)}
							<button
								type="button"
								use:tip={opt.title}
								aria-label={opt.title}
								class="hover:preset-tonal p-1 {activeAlign(col) === opt.value ? 'preset-filled-primary-500' : ''}"
								onclick={() => setAlign(i, opt.value)}
							>
								<opt.icon class="size-3.5" />
							</button>
						{/if}
					{/each}
				</div>
				{#if col.width !== undefined}
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
			<Switch.Control class="preset-filled-surface-200-800 data-[state=checked]:preset-filled-primary-500"><Switch.Thumb /></Switch.Control>
			<Switch.HiddenInput />
		</Switch>
		<hr class="border-surface-200-800 mt-3" />
	</div>
{:else if colspec && colspec.trim()}
	<!-- spec too exotic to model visually: edit the verbatim string -->
	<div class="mb-3">
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
