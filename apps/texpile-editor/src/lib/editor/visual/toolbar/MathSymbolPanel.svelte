<script lang="ts">
	// The symbol palette, DOCKED at the bottom of the editor pane rather than floating over it.
	//
	// It used to be a Popover anchored to the toolbar, which meant it opened downward straight onto
	// the equation being edited - and, worse, Zag returns focus to a popover's trigger when it closes
	// (setFinalFocus), blurring the mathfield after every single insert. As part of the layout it
	// covers nothing, and there is no trigger for focus to go back to.
	import { tip } from '$lib/components/tooltip.svelte';
	import { onMount } from 'svelte';
	import { X } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages';
	import { insertSymbol } from './mathInsert';
	import { SYMBOL_GROUPS, MATRIX_BRACKETS, generateMatrixLatex, symbolTooltip, type MatrixBracket } from './mathSymbols';

	let { groupId, top, left, onClose }: { groupId: string; top: number; left: number; onClose: () => void } = $props();

	let panelEl = $state<HTMLDivElement>();

	const group = $derived(SYMBOL_GROUPS.find((g) => g.id === groupId) ?? SYMBOL_GROUPS[0]);

	let matrixGridHoverRows = $state(2);
	let matrixGridHoverCols = $state(2);
	let matrixBracketMode = $state<MatrixBracket>('pmatrix');

	// mathlive loads lazily so a static edge here can't drag it into the eager bundle
	let convertLatexToMarkup = $state<((latex: string) => string) | null>(null);
	onMount(() => {
		Promise.all([import('mathlive'), import('mathlive/static.css')]).then(([ml]) => {
			convertLatexToMarkup = ml.convertLatexToMarkup;
		});
	});

	function renderLatex(latex: string): string {
		try {
			return convertLatexToMarkup ? convertLatexToMarkup(latex) : latex;
		} catch {
			return latex;
		}
	}

	// mousedown fires before focus changes, so preventDefault keeps the mathfield focused
	function preventFocusLoss(e: MouseEvent | PointerEvent) {
		e.preventDefault();
		e.stopPropagation();
	}

	function pick(latex: string) {
		insertSymbol(latex);
		onClose();
	}

	function insertCustomMatrix(rows: number, cols: number) {
		pick(generateMatrixLatex(rows, cols, matrixBracketMode));
	}

	// Dismiss on pointer down outside and on Escape. No scrim (it competes in whatever stacking
	// context it lands in) and no Zag popover (its setFinalFocus returns focus to the trigger, which
	// blurred the mathfield after every insert - the bug this whole panel came from).
	$effect(() => {
		function onDown(e: PointerEvent) {
			const t = e.target as Node | null;
			if (t && panelEl?.contains(t)) return;
			if (t instanceof Element && t.closest('[data-math-toolbar]')) return; // the trigger toggles itself
			onClose();
		}
		function onKey(e: KeyboardEvent) {
			if (e.key === 'Escape') onClose();
		}
		window.addEventListener('pointerdown', onDown, true);
		window.addEventListener('keydown', onKey, true);
		return () => {
			window.removeEventListener('pointerdown', onDown, true);
			window.removeEventListener('keydown', onKey, true);
		};
	});
</script>

<div
	bind:this={panelEl}
	class="card bg-surface-50-950 border-surface-300-700 fixed z-50 flex max-h-[min(26rem,60vh)] min-w-[200px] flex-col border shadow-lg"
	style="top: {top}px; left: {left}px"
>
	<div class="border-surface-300-700 flex shrink-0 items-center justify-between border-b px-3 py-1.5">
		<span class="text-surface-600-400 text-xs font-semibold uppercase">{group.label()}</span>
		<button
			class="hover:preset-tonal rounded-base p-1"
			onmousedown={preventFocusLoss}
			onclick={onClose}
			aria-label={m.mathpanel_close_aria()}
		>
			<X class="size-4" />
		</button>
	</div>
	<div class="flex-1 overflow-y-auto" tabindex="-1" role="presentation" onmousedown={preventFocusLoss}>
		{#if group.id === 'matrices'}
			<div class="border-surface-300-700 border-b p-3">
				<div class="mb-2 text-xs font-medium">{m.mathtoolbar_matrix_style_label()}</div>
				<div class="mb-3 flex flex-wrap gap-2">
					{#each MATRIX_BRACKETS as b (b.mode)}
						<button
							type="button"
							class="rounded-base border px-2 py-1 text-xs transition-colors"
							class:preset-tonal-primary={matrixBracketMode === b.mode}
							class:border-math-key-edge={matrixBracketMode === b.mode}
							class:bg-surface-100-900={matrixBracketMode !== b.mode}
							class:border-surface-300-700={matrixBracketMode !== b.mode}
							onclick={() => (matrixBracketMode = b.mode)}
							onmousedown={preventFocusLoss}
							tabindex="-1"
							use:tip={b.title()}
						>
							{b.label}
						</button>
					{/each}
				</div>
				<div class="mb-2 text-xs font-medium">{m.mathtoolbar_matrix_size_label()}</div>
				<div class="space-y-2">
					<div class="grid gap-1" style="grid-template-columns: repeat(6, 1fr);">
						{#each Array.from({ length: 6 }) as _, row (row)}
							{#each Array.from({ length: 6 }) as _, col (col)}
								<button
									type="button"
									class="aspect-square w-full rounded-base border text-xs transition-colors"
									class:preset-tonal-primary={row + 1 <= matrixGridHoverRows && col + 1 <= matrixGridHoverCols}
									class:border-math-key-edge={row + 1 <= matrixGridHoverRows && col + 1 <= matrixGridHoverCols}
									class:bg-surface-100-900={!(row + 1 <= matrixGridHoverRows && col + 1 <= matrixGridHoverCols)}
									class:border-surface-300-700={!(row + 1 <= matrixGridHoverRows && col + 1 <= matrixGridHoverCols)}
									aria-label={m.mathtoolbar_insert_matrix_aria({ rows: row + 1, cols: col + 1 })}
									onmouseover={() => {
										matrixGridHoverRows = row + 1;
										matrixGridHoverCols = col + 1;
									}}
									onfocus={() => {
										matrixGridHoverRows = row + 1;
										matrixGridHoverCols = col + 1;
									}}
									onpointerdown={(e) => {
										e.preventDefault();
										insertCustomMatrix(row + 1, col + 1);
									}}
									onmousedown={preventFocusLoss}
									tabindex="-1"
								>
								</button>
							{/each}
						{/each}
					</div>
					<div class="text-surface-600 text-center text-xs font-medium">{matrixGridHoverRows}×{matrixGridHoverCols}</div>
				</div>
			</div>
		{/if}

		{#if group.id === 'environments'}
			<div class="env-list">
				{#each group.symbols as symbol (symbol.latex)}
					<button
						type="button"
						class="env-btn bg-surface-100-900"
						tabindex="-1"
						onmousedown={preventFocusLoss}
						onpointerdown={(e) => {
							e.preventDefault();
							pick(symbol.latex);
						}}
						use:tip={symbolTooltip(symbol) || symbol.latex}
					>
						<span class="env-label">{symbolTooltip(symbol)}</span>
						<span class="env-preview">
							<!-- eslint-disable-next-line svelte/no-at-html-tags -- renderLatex() is mathlive's own trusted math-typesetting HTML for a symbol from the hardcoded SYMBOL_GROUPS table above, never user/network input. -->
							{@html renderLatex(symbol.displayLatex ?? symbol.latex)}
						</span>
					</button>
				{/each}
			</div>
		{:else}
			<div class="symbol-grid" data-group={group.id}>
				{#each group.symbols as symbol (symbol.latex)}
					<button
						type="button"
						class="symbol-btn bg-surface-100-900"
						tabindex="-1"
						onmousedown={preventFocusLoss}
						onpointerdown={(e) => {
							e.preventDefault();
							pick(symbol.latex);
						}}
						use:tip={symbolTooltip(symbol) || symbol.latex}
					>
						<span class="symbol-content">
							<!-- eslint-disable-next-line svelte/no-at-html-tags -- renderLatex() is mathlive's own trusted math-typesetting HTML for a symbol from the hardcoded SYMBOL_GROUPS table above, never user/network input. -->
							{@html renderLatex(symbol.displayLatex ?? symbol.latex)}
						</span>
					</button>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style lang="postcss">
	@reference "../../../../app.css";

	/* No max-height or overflow here: the card body scrolls (see the wrapper's overflow-y-auto), and
	   when both did you got two scrollbars side by side. Each grid used to sit in its own popover and
	   owned its own height; the panel owns it now. */
	.symbol-grid {
		display: grid;
		gap: calc(var(--spacing) * 1);
		grid-template-columns: repeat(4, 80px);
		padding: calc(var(--spacing) * 1.5);
	}

	.symbol-grid[data-group='greek'] {
		grid-template-columns: repeat(6, 56px);
	}

	.symbol-grid[data-group='matrices'] {
		grid-template-columns: repeat(3, 66px);
	}

	.env-list {
		display: flex;
		flex-direction: column;
		gap: calc(var(--spacing) * 0.5);
		padding: calc(var(--spacing) * 1.5);
		width: calc(var(--spacing) * 65);
	}

	.env-btn {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: calc(var(--spacing) * 1);
		width: 100%;
		padding: calc(var(--spacing) * 2) calc(var(--spacing) * 3);
		border-radius: var(--radius-base);
		border: var(--default-border-width) solid transparent;
		text-align: left;
		transition:
			background-color 0.15s,
			border-color 0.15s;
	}

	.env-btn:hover {
		background: var(--math-key-hover);
		border-color: var(--math-key-edge);
	}

	.env-btn:active {
		background: var(--math-key-down);
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

	.symbol-btn {
		display: grid;
		place-items: center;
		width: calc(var(--spacing) * 20);
		height: calc(var(--spacing) * 20);
		border-radius: var(--radius-base);
		border: var(--default-border-width) solid transparent;
		transition:
			background-color 0.15s,
			border-color 0.15s;
		overflow: hidden;
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

	.symbol-grid[data-group='matrices'] .symbol-btn {
		width: calc(var(--spacing) * 16.5);
		height: calc(var(--spacing) * 16.5);
		padding: calc(var(--spacing) * 1);
	}

	.symbol-grid[data-group='matrices'] .symbol-content {
		font-size: 1.1rem;
	}

	.symbol-grid[data-group='greek'] .symbol-btn {
		width: calc(var(--spacing) * 14);
		height: calc(var(--spacing) * 14);
	}

	.symbol-grid[data-group='greek'] .symbol-content {
		font-size: 1.8rem;
	}

	.symbol-btn:hover {
		background: var(--math-key-hover);
		border-color: var(--math-key-edge);
	}

	.symbol-btn:active {
		background: var(--math-key-down);
	}
</style>
