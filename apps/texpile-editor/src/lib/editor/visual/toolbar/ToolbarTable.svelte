<script lang="ts">
	import { tip } from '$lib/components/tooltip.svelte';
	import { editorViewStore, templateFeaturesStore } from '$lib/stores/editorStore';
	import { Popover, Portal, Switch } from '@skeletonlabs/skeleton-svelte';
	import { Table } from '@lucide/svelte';
	import { createTableNode } from '$lib/editor/visual/tableUtils';
	import { m } from '$lib/paraglide/messages';

	const maxRows = 10;
	const maxCols = 10;

	let open = $state(false);
	let hoveredCells = $state({ rows: 1, cols: 1 });

	const tableCaptionEnabled = $derived(templateFeaturesStore.current?.tableCaption ?? true);

	let numberedState = $state(true); // user's preference while enabled
	let numbered = $derived(tableCaptionEnabled ? numberedState : false);

	function isCellHighlighted(row: number, col: number) {
		return row <= hoveredCells.rows && col <= hoveredCells.cols;
	}

	let highlightedCells = $state(getHighlightedCells());

	function getHighlightedCells() {
		let cells = [];
		for (let row = 1; row <= maxRows; row++) {
			for (let col = 1; col <= maxCols; col++) {
				cells.push({ row, col, highlighted: isCellHighlighted(row, col) });
			}
		}
		return cells;
	}
	function handleMouseOver(row: number, col: number) {
		hoveredCells = { rows: row, cols: col };
		highlightedCells = getHighlightedCells();
	}

	function preventFocusLoss(e: MouseEvent) {
		e.preventDefault(); // keep the caret in the ProseMirror view
	}

	function insertTable() {
		const view = editorViewStore.current;
		if (!view) {
			console.error('Editor view is not available');
			return;
		}
		const { state, dispatch } = view;
		let tr = state.tr;
		const tableNode = createTableNode(state.schema, hoveredCells.rows, hoveredCells.cols, numbered);
		const insertPos = tr.selection.from;
		tr = tr.insert(insertPos, tableNode);
		dispatch(tr);
		view.focus();
		open = false;
	}
</script>

<Popover
	{open}
	onOpenChange={(e) => (open = e.open)}
	positioning={{ placement: 'bottom-start', offset: { mainAxis: 0 } }}
	autoFocus={false}
>
	<!-- same trigger chrome as the typ/md table dropdowns: tonal while open, preset hover -->
	<Popover.Trigger>
		<div class={`toolbarButton ${open ? 'preset-tonal-primary' : 'hover:preset-tonal'}`}>
			<button
				class="flex items-center p-1"
				aria-label={m.tbar_insert_table_aria()}
				use:tip={m.tbar_insert_table_aria()}
				onmousedown={preventFocusLoss}
			>
				<Table class="h-5 w-5" />
			</button>
		</div>
	</Popover.Trigger>

	<Portal>
		<Popover.Positioner class="z-floating-ui">
			<Popover.Content class="card bg-surface-50-950 border-surface-300-700 border p-3 shadow-lg">
				<!-- the content is portalled outside the toolbar, so it needs its own focus guard -->
				<div role="presentation" onmousedown={preventFocusLoss}>
					<p class="mb-2 text-center text-sm">{hoveredCells.rows}x{hoveredCells.cols}</p>
					<div class="mb-3 grid grid-cols-10 gap-1">
						{#each highlightedCells as cell (`${cell.row}-${cell.col}`)}
							<button
								type="button"
								class="h-6 w-6 rounded"
								class:bg-surface-200-800={!cell.highlighted}
								class:bg-blue={cell.highlighted}
								onmouseenter={() => handleMouseOver(cell.row, cell.col)}
								onfocus={() => handleMouseOver(cell.row, cell.col)}
								onclick={insertTable}
								aria-label={m.tbar_insert_table_size_aria({ rows: cell.row, cols: cell.col })}
							></button>
						{/each}
					</div>

					{#if tableCaptionEnabled}
						<Switch
							name="numbered-table"
							checked={numberedState}
							onCheckedChange={(e) => (numberedState = e.checked)}
							class="flex cursor-pointer items-center justify-between text-sm"
						>
							<Switch.Label>{m.tbar_numbered_table()}</Switch.Label>
							<Switch.Control class="preset-filled-surface-200-800 data-[state=checked]:preset-filled-primary-500">
								<Switch.Thumb />
							</Switch.Control>
							<Switch.HiddenInput />
						</Switch>
					{:else}
						<div class="w-full" use:tip={m.tbar_feature_not_enabled()}>
							<Switch
								name="numbered-table"
								checked={false}
								disabled
								class="flex cursor-not-allowed items-center justify-between text-sm opacity-50"
							>
								<Switch.Label>{m.tbar_numbered_table()}</Switch.Label>
								<Switch.Control class="preset-filled-surface-200-800">
									<Switch.Thumb />
								</Switch.Control>
								<Switch.HiddenInput />
							</Switch>
						</div>
					{/if}
				</div>
			</Popover.Content>
		</Popover.Positioner>
	</Portal>
</Popover>

<style lang="postcss">
	@reference "../../../../app.css";

	.toolbarButton {
		@apply rounded-base transition-all ease-in-out;
	}
</style>
