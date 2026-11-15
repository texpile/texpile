<script lang="ts">
	// a Typst table's columns: each one's side, and the sizes its columns: argument gives them
	import { tip } from '$lib/components/tooltip.svelte';
	import { AlignLeft, AlignCenter, AlignRight } from '@lucide/svelte';
	import type { Node } from 'prosemirror-model';
	import { m } from '$lib/paraglide/messages';
	import { alignValue, columnAligns, sideOfAlign, withColumnSide, type ColumnSide } from './typstColumnAligns';

	type Props = {
		table: Node | null;
		/** the columns: value as written */
		colspec: string;
		setColspec: (spec: string) => void;
		/** the side a column takes when it names none: the text around the table */
		inherited: ColumnSide;
		setAlign: (align: string | null) => void;
	};

	const props: Props = $props();

	const SIDES = [
		{ value: 'left', icon: AlignLeft, title: m.tablewrap_align_left() },
		{ value: 'center', icon: AlignCenter, title: m.tablewrap_align_center() },
		{ value: 'right', icon: AlignRight, title: m.tablewrap_align_right() }
	] as const;

	const columnCount = $derived.by(() => {
		if (!props.table || props.table.childCount === 0) return 0;
		let count = 0;
		props.table.child(0).forEach((cell) => (count += Number(cell.attrs.colspan ?? 1)));
		return count;
	});
	const written = $derived(typeof props.table?.attrs.typAlign === 'string' ? props.table.attrs.typAlign : null);
	const aligns = $derived(columnAligns(written, columnCount));
</script>

{#if columnCount > 0}
	<div class="mb-3">
		<div class="text-muted mb-1.5 text-xs font-semibold">{m.tablewrap_columns_heading()}</div>
		{#if aligns}
			{#each aligns as align, i (i)}
				<div class="mb-1 flex items-center gap-2">
					<span class="text-faint w-4 text-right text-xs">{i + 1}</span>
					<div class="border-surface-300-700 rounded-container flex overflow-hidden border" role="radiogroup">
						{#each SIDES as side (side.value)}
							<button
								type="button"
								role="radio"
								aria-checked={(sideOfAlign(align) ?? props.inherited) === side.value}
								use:tip={side.title}
								aria-label={side.title}
								class="hover:preset-tonal p-1 {(sideOfAlign(align) ?? props.inherited) === side.value ? 'preset-filled-primary-500' : ''}"
								onclick={() => props.setAlign(alignValue(withColumnSide(aligns, i, side.value)))}
							>
								<side.icon class="size-3.5" />
							</button>
						{/each}
					</div>
				</div>
			{/each}
		{:else}
			<!-- an align by function or of another length: the value as written -->
			<input
				class="input w-full px-1.5 py-0.5 font-mono text-xs"
				value={written ?? ''}
				aria-label={m.typ_layout_field_align()}
				onchange={(e) => props.setAlign(e.currentTarget.value.trim() || null)}
			/>
			<div class="text-faint mt-1 text-xs">{m.tablewrap_column_spec_hint()}</div>
		{/if}
		<label class="mt-2 flex items-center gap-2">
			<span class="text-muted shrink-0 text-xs">{m.tablewrap_column_sizes()}</span>
			<input
				class="input min-w-0 flex-1 px-1.5 py-0.5 font-mono text-xs"
				value={props.colspec}
				placeholder={String(columnCount)}
				onchange={(e) => props.setColspec(e.currentTarget.value.trim())}
			/>
		</label>
		<hr class="border-surface-200-800 mt-3" />
	</div>
{/if}
