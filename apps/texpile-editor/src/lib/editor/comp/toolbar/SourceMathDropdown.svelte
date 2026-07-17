<script lang="ts">
	// Source-mode counterpart to MathToolbar: same symbol table, but symbols go in as CodeMirror
	// snippets rather than through a mathfield.
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
	// Omega, not Sigma: the toolbar's Sigma already means "wrap in inline math"
	import { ChevronDown, Omega } from '@lucide/svelte';
	import { convertLatexToMarkup } from 'mathlive';
	import 'mathlive/static.css';
	import { sourceCmView } from '$lib/stores/editorStore';
	import { insertSnippetAtCursor } from './sourceInsert';
	import { SYMBOL_GROUPS, MATRIX_BRACKETS, generateMatrixLatex, toCmSnippet, toSourceBlock, type MatrixBracket } from './mathSymbols';

	let open = $state(false);
	let activeGroup = $state(SYMBOL_GROUPS[0].id);
	let matrixRows = $state(2);
	let matrixCols = $state(2);
	let matrixBracket = $state<MatrixBracket>('pmatrix');

	const group = $derived(SYMBOL_GROUPS.find((g) => g.id === activeGroup) ?? SYMBOL_GROUPS[0]);

	function renderLatex(latex: string): string {
		try {
			return convertLatexToMarkup(latex);
		} catch {
			return latex;
		}
	}

	// mousedown fires before focus moves, so this keeps the caret in the CodeMirror view
	function preventFocusLoss(e: MouseEvent) {
		e.preventDefault();
	}

	function insert(latex: string) {
		const view = $sourceCmView;
		if (!view) return;
		open = false;
		// toSourceBlock breaks matrices and cases over lines; the snippet then lays out the tab stops,
		// which Tab/Shift-Tab walk and Escape drops out of
		insertSnippetAtCursor(view, toCmSnippet(toSourceBlock(latex)));
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
			class="toolbarButton flex items-center gap-1 rounded p-1 hover:preset-tonal"
			class:preset-tonal-primary={open}
			aria-label="Math symbols"
			title="Math symbols"
			tabindex="-1"
			onmousedown={preventFocusLoss}
		>
			<Omega class="h-4.5 w-4.5" />
			<ChevronDown class="h-3 w-3 opacity-50" />
		</button>
	</Popover.Trigger>

	<Portal>
		<Popover.Positioner class="z-floating-ui">
			<Popover.Content class="card bg-surface-50-950 border-surface-300-700 w-[26rem] border shadow-lg">
				<div role="presentation" onmousedown={preventFocusLoss}>
					<div class="border-surface-300-700 flex flex-wrap gap-0.5 border-b p-1.5">
						{#each SYMBOL_GROUPS as g (g.id)}
							{@const Icon = g.icon}
							<button
								type="button"
								class="flex items-center gap-1 rounded px-1.5 py-1 text-xs transition-colors"
								class:preset-tonal-primary={activeGroup === g.id}
								class:hover:preset-tonal={activeGroup !== g.id}
								tabindex="-1"
								onclick={() => (activeGroup = g.id)}
								title={g.label}
							>
								<Icon class="h-3.5 w-3.5" />
								{g.label}
							</button>
						{/each}
					</div>

					<!-- tabs stay put; only the palette body scrolls -->
					<div class="max-h-[60vh] overflow-y-auto">
						{#if group.id === 'matrices'}
							<div class="border-surface-300-700 border-b p-3">
								<div class="mb-2 text-xs font-medium">Matrix style</div>
								<div class="mb-3 flex flex-wrap gap-2">
									{#each MATRIX_BRACKETS as b (b.mode)}
										<button
											type="button"
											class="rounded border px-2 py-1 text-xs transition-colors"
											class:preset-tonal-primary={matrixBracket === b.mode}
											class:border-blue-400={matrixBracket === b.mode}
											class:bg-surface-100-900={matrixBracket !== b.mode}
											class:border-surface-300-700={matrixBracket !== b.mode}
											tabindex="-1"
											onclick={() => (matrixBracket = b.mode)}
											title={b.title}
										>
											{b.label}
										</button>
									{/each}
								</div>
								<div class="mb-2 text-xs font-medium">Size</div>
								<!-- fixed cells, not 1fr: this popover is as wide as its tab row, and 1fr blew the
							     6x6 grid up to ~95px a cell -->
								<div class="grid w-fit gap-1" style="grid-template-columns: repeat(6, 1.5rem);">
									{#each Array.from({ length: 6 }) as _, row (row)}
										{#each Array.from({ length: 6 }) as _, col (col)}
											<button
												type="button"
												class="size-6 rounded border text-xs transition-colors"
												class:preset-tonal-primary={row < matrixRows && col < matrixCols}
												class:border-blue-400={row < matrixRows && col < matrixCols}
												class:bg-surface-100-900={!(row < matrixRows && col < matrixCols)}
												class:border-surface-300-700={!(row < matrixRows && col < matrixCols)}
												aria-label={`Insert ${row + 1}x${col + 1} matrix`}
												tabindex="-1"
												onmouseover={() => {
													matrixRows = row + 1;
													matrixCols = col + 1;
												}}
												onfocus={() => {
													matrixRows = row + 1;
													matrixCols = col + 1;
												}}
												onclick={() => insert(generateMatrixLatex(row + 1, col + 1, matrixBracket))}
											></button>
										{/each}
									{/each}
								</div>
								<div class="text-surface-600-400 mt-2 w-fit text-center text-xs font-medium">{matrixRows}x{matrixCols}</div>
							</div>
						{/if}

						{#if group.id === 'environments'}
							<div class="env-list">
								{#each group.symbols as symbol (symbol.latex)}
									<button type="button" class="env-btn bg-surface-100-900" tabindex="-1" onclick={() => insert(symbol.latex)}>
										<span class="env-label">{symbol.tooltip}</span>
										<span class="env-preview">
											<!-- eslint-disable-next-line svelte/no-at-html-tags -- renderLatex() is mathlive's own trusted math-typesetting HTML for a symbol from the hardcoded SYMBOL_GROUPS table, never user/network input. -->
											{@html renderLatex(symbol.displayLatex ?? symbol.latex)}
										</span>
									</button>
								{/each}
							</div>
						{:else}
							<div class="symbol-grid" data-group={group.id}>
								{#each group.symbols as symbol (symbol.latex + (symbol.tooltip ?? ''))}
									<button
										type="button"
										class="symbol-btn bg-surface-100-900"
										tabindex="-1"
										onclick={() => insert(symbol.latex)}
										title={symbol.tooltip || symbol.latex}
									>
										<span class="symbol-content">
											<!-- eslint-disable-next-line svelte/no-at-html-tags -- renderLatex() is mathlive's own trusted math-typesetting HTML for a symbol from the hardcoded SYMBOL_GROUPS table, never user/network input. -->
											{@html renderLatex(symbol.displayLatex ?? symbol.latex)}
										</span>
									</button>
								{/each}
							</div>
						{/if}
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

	/* auto-fill against the popover's fixed width, so a grid never leaves half the panel empty */
	.symbol-grid {
		display: grid;
		gap: 4px;
		grid-template-columns: repeat(auto-fill, minmax(68px, 1fr));
		padding: 6px;
	}

	.symbol-grid[data-group='greek'] {
		grid-template-columns: repeat(auto-fill, minmax(46px, 1fr));
	}

	.symbol-grid[data-group='matrices'] {
		grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
	}

	.symbol-btn {
		display: grid;
		place-items: center;
		aspect-ratio: 1;
		border-radius: 4px;
		border: 1px solid transparent;
		transition:
			background-color 0.15s,
			border-color 0.15s;
		overflow: hidden;
	}

	.symbol-grid[data-group='greek'] .symbol-content {
		font-size: 1.6rem;
	}

	.symbol-grid[data-group='matrices'] .symbol-btn {
		padding: 4px;
	}

	/* the matrix previews are the tallest things in the palette; shrink them to fit their button
	   (MathToolbar does the same) */
	.symbol-grid[data-group='matrices'] .symbol-content {
		font-size: 1rem;
	}

	.symbol-btn:hover {
		background: var(--color-blue-200, #bfdbfe);
		border-color: var(--color-blue-400, #60a5fa);
	}

	.symbol-btn:active {
		@apply bg-blue-300;
	}

	.symbol-content {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		overflow: hidden;
		pointer-events: none;
	}

	.env-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 6px;
		width: 260px;
		max-height: 50vh;
		overflow-y: auto;
	}

	.env-btn {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 4px;
		width: 100%;
		padding: 8px 12px;
		border-radius: 4px;
		border: 1px solid transparent;
		text-align: left;
		transition:
			background-color 0.15s,
			border-color 0.15s;
	}

	.env-btn:hover {
		background: var(--color-blue-200, #bfdbfe);
		border-color: var(--color-blue-400, #60a5fa);
	}

	.env-label {
		font-size: 0.8rem;
		font-weight: 500;
		color: var(--color-surface-600);
	}

	.env-preview {
		display: flex;
		align-items: center;
		font-size: 0.95rem;
		pointer-events: none;
	}
</style>
