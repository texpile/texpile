<script lang="ts">
	// The Source-mode counterpart to ToolbarTable: same drag-a-grid gesture, but it writes LaTeX
	// rather than building a ProseMirror node.
	import { tip } from '$lib/components/tooltip.svelte';
	import { Popover, Portal, Switch } from '@skeletonlabs/skeleton-svelte';
	import { Table } from '@lucide/svelte';
	import { sourceCmView } from '$lib/stores/editorStore';
	import { tableLatex } from './tableLatex';
	import { insertSnippetAtCursor } from './sourceInsert';
	import { m } from '$lib/paraglide/messages';

	const MAX = 10;

	let open = $state(false);
	let rows = $state(2);
	let cols = $state(2);
	let float = $state(true);
	let rules = $state(true);
	let header = $state(true);

	const cells = $derived(
		Array.from({ length: MAX * MAX }, (_, i) => ({
			row: Math.floor(i / MAX) + 1,
			col: (i % MAX) + 1
		}))
	);

	function preventFocusLoss(e: MouseEvent) {
		e.preventDefault(); // keep the caret in the CodeMirror view
	}

	function insert(r: number, c: number) {
		const view = sourceCmView.current;
		if (!view) return;
		open = false;
		insertSnippetAtCursor(view, tableLatex({ rows: r, cols: c, float, rules, header }));
	}
</script>

<Popover
	{open}
	onOpenChange={(e) => (open = e.open)}
	positioning={{ placement: 'bottom-start', offset: { mainAxis: 0 } }}
	autoFocus={false}
>
	<Popover.Trigger>
		<button
			class="toolbarButton flex items-center rounded-base p-1 hover:preset-tonal"
			class:preset-tonal-primary={open}
			aria-label={m.tbar_insert_table_aria()}
			use:tip={m.tbar_insert_table_aria()}
			tabindex="-1"
			onmousedown={preventFocusLoss}
		>
			<Table class="h-4.5 w-4.5" />
		</button>
	</Popover.Trigger>

	<Portal>
		<Popover.Positioner class="z-floating-ui">
			<Popover.Content class="card bg-surface-50-950 border-surface-300-700 border p-3 shadow-lg">
				<div role="presentation" onmousedown={preventFocusLoss}>
					<p class="mb-2 text-center text-sm">{rows}x{cols}</p>
					<div class="mb-3 grid grid-cols-10 gap-1">
						{#each cells as cell (`${cell.row}-${cell.col}`)}
							<button
								type="button"
								class="h-6 w-6 rounded-base"
								class:bg-surface-200-800={!(cell.row <= rows && cell.col <= cols)}
								class:bg-blue={cell.row <= rows && cell.col <= cols}
								tabindex="-1"
								onmouseenter={() => {
									rows = cell.row;
									cols = cell.col;
								}}
								onfocus={() => {
									rows = cell.row;
									cols = cell.col;
								}}
								onclick={() => insert(cell.row, cell.col)}
								aria-label={m.tbar_insert_table_size_aria({ rows: cell.row, cols: cell.col })}
							></button>
						{/each}
					</div>

					<div class="space-y-1.5">
						<Switch
							name="table-float"
							checked={float}
							onCheckedChange={(e) => (float = e.checked)}
							class="flex cursor-pointer items-center justify-between gap-6 text-sm"
						>
							<Switch.Label>{m.tbar_caption_and_label()}</Switch.Label>
							<Switch.Control class="preset-filled-surface-200-800 data-[state=checked]:preset-filled-primary-500">
								<Switch.Thumb />
							</Switch.Control>
							<Switch.HiddenInput />
						</Switch>
						<Switch
							name="table-rules"
							checked={rules}
							onCheckedChange={(e) => (rules = e.checked)}
							class="flex cursor-pointer items-center justify-between gap-6 text-sm"
						>
							<Switch.Label>{m.tbar_horizontal_rules()}</Switch.Label>
							<Switch.Control class="preset-filled-surface-200-800 data-[state=checked]:preset-filled-primary-500">
								<Switch.Thumb />
							</Switch.Control>
							<Switch.HiddenInput />
						</Switch>
						<Switch
							name="table-header"
							checked={header}
							onCheckedChange={(e) => (header = e.checked)}
							disabled={!rules}
							class="flex items-center justify-between gap-6 text-sm {rules ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}"
						>
							<Switch.Label>{m.tbar_header_row()}</Switch.Label>
							<Switch.Control class="preset-filled-surface-200-800 data-[state=checked]:preset-filled-primary-500">
								<Switch.Thumb />
							</Switch.Control>
							<Switch.HiddenInput />
						</Switch>
					</div>
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
