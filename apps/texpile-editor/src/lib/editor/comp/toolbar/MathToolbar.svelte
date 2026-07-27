<script lang="ts" module>
	// paletteOpen keeps Toolbar from unmounting us: Zag hands focus to the closing popover's trigger
	// on the next frame, which blurs the mathfield, and Toolbar drops this toolbar the instant a
	// mathfield isn't focused. Without it the palette vanishes under the user's cursor mid-click.
	export const mathToolbarState = $state({ aiInputActive: false, paletteOpen: false });
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
	import { Keyboard, ChevronDown, BoxSelect } from '@lucide/svelte';
	import { editorViewStore } from '$lib/stores/editorStore';
	import { TextSelection } from 'prosemirror-state';
	import { m } from '$lib/paraglide/messages';
	import { SYMBOL_GROUPS, MATRIX_BRACKETS, generateMatrixLatex, symbolTooltip, type MatrixBracket } from './mathSymbols';

	// mathlive loads lazily so a static edge here can't drag it into the eager bundle (EditorView
	// already pulls it in with the math plugin, so this resolves from cache by the time we show).
	// static.css provides styles for convertLatexToMarkup output (fonts.css already loaded by mlview)
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

	let activeMathfieldRef: HTMLElement | null = $state(null);
	let savedSelection: { start: number; end: number } | null = $state(null);
	let matrixGridHoverRows = $state(2);
	let matrixGridHoverCols = $state(2);
	let matrixBracketMode = $state<MatrixBracket>('pmatrix');

	// this toolbar only shows while a mathfield is focused, so capture the ref eagerly
	$effect(() => {
		if (document.activeElement instanceof window.MathfieldElement) {
			activeMathfieldRef = document.activeElement;
		}
	});

	let isBlockMath = $derived.by(() => {
		if (!activeMathfieldRef) return false;
		return activeMathfieldRef.closest('.block-math-container') !== null;
	});

	function selectBlockMath() {
		const view = $editorViewStore;
		if (!view || !activeMathfieldRef) return;

		const container = activeMathfieldRef.closest('.block-math-container');
		if (!container) return;

		const pos = view.posAtDOM(container, 0);
		if (pos === null || pos === undefined) return;

		const resolvedPos = view.state.doc.resolve(pos);
		let nodePos = pos;
		let node = view.state.doc.nodeAt(pos);

		// pos lands inside the text content, walk up to the block_math itself
		if (!node || node.type.name !== 'block_math') {
			for (let d = resolvedPos.depth; d > 0; d--) {
				const parentNode = resolvedPos.node(d);
				if (parentNode.type.name === 'block_math') {
					nodePos = resolvedPos.before(d);
					node = parentNode;
					break;
				}
			}
		}

		if (!node || node.type.name !== 'block_math') return;

		const from = nodePos;
		const to = nodePos + node.nodeSize;
		const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to));
		view.dispatch(tr);
		view.focus();
	}

	let openGroup = $state<string | null>(null);

	// derived in one place so no assignment site can forget it
	$effect(() => {
		mathToolbarState.paletteOpen = openGroup !== null;
		return () => (mathToolbarState.paletteOpen = false);
	});

	// mousedown fires before focus changes, so preventDefault keeps the mathfield focused
	function preventFocusLoss(e: MouseEvent | PointerEvent) {
		e.preventDefault();
		e.stopPropagation();
	}

	function toggleGroup(groupId: string) {
		// capture the mathfield ref and cursor position before any state changes
		const mf = document.activeElement;
		if (mf instanceof window.MathfieldElement) {
			activeMathfieldRef = mf;
			const sel = mf.selection;
			if (sel && typeof sel === 'object' && 'ranges' in sel) {
				const ranges = sel.ranges;
				if (ranges && ranges.length > 0) {
					savedSelection = { start: ranges[0][0], end: ranges[0][1] };
				}
			} else {
				// fallback: position property
				const pos = mf.position ?? 0;
				savedSelection = { start: pos, end: pos };
			}
		}

		const isClosing = openGroup === groupId;
		openGroup = isClosing ? null : groupId;

		// Only on close. While a palette is open focus legitimately sits on the trigger (zag's
		// setFinalFocus puts it there), and pulling it back to the mathfield reads as an outside
		// interaction and dismisses the palette. mathToolbarState.paletteOpen is what keeps this
		// toolbar mounted through that blur.
		if (isClosing && activeMathfieldRef) {
			setTimeout(() => {
				activeMathfieldRef?.focus();
			}, 0);
		}
	}

	function insertSymbol(latex: string) {
		const mf = activeMathfieldRef;
		const selToRestore = savedSelection;

		if (mf && mf instanceof window.MathfieldElement) {
			openGroup = null;

			// setTimeout so focus happens after the popover closes
			setTimeout(() => {
				mf.focus();
				if (selToRestore) {
					mf.selection = { ranges: [[selToRestore.start, selToRestore.end]] };
				}
				mf.insert(latex, {
					selectionMode: 'placeholder',
					format: 'latex'
				});
			}, 0);
		} else {
			openGroup = null;
		}
	}

	function toggleVirtualKeyboard() {
		if (window.mathVirtualKeyboard?.visible) {
			window.mathVirtualKeyboard.hide();
		} else {
			window.mathVirtualKeyboard.show();
		}
		if (activeMathfieldRef) {
			activeMathfieldRef.focus();
		}
	}

	function insertCustomMatrix(rows: number, cols: number) {
		const latex = generateMatrixLatex(rows, cols, matrixBracketMode);
		openGroup = null;
		insertSymbol(latex);
	}
</script>

<ul class="flex items-center gap-1 sm:gap-1.5 2xl:gap-2">
	{#each SYMBOL_GROUPS as group}
		{@const Icon = group.icon}
		<li>
			<Popover
				open={openGroup === group.id}
				onOpenChange={(e) => {
					// Every popover reports its own close, including the outgoing one when the user switches
					// straight from one group to another. Only the group that is still open may clear the
					// state: otherwise the closing group wipes the one just opened and it never renders.
					if (!e.open && openGroup === group.id) {
						openGroup = null;
					}
				}}
				positioning={{ placement: 'bottom-start', offset: { mainAxis: 0 } }}
				autoFocus={false}
			>
				<Popover.Trigger>
					<button
						class="toolbarButton flex items-center gap-1 rounded p-1 hover:preset-tonal"
						class:preset-tonal-primary={openGroup === group.id}
						aria-label={group.label()}
						title={group.label()}
						tabindex="-1"
						onmousedown={preventFocusLoss}
						onclick={() => toggleGroup(group.id)}
					>
						<Icon class="h-4 w-4" />
						<span class="text-xs">{group.label()}</span>
						<ChevronDown class="h-3 w-3 opacity-50" />
					</button>
				</Popover.Trigger>

				<Portal>
					<Popover.Positioner class="z-floating-ui">
						<Popover.Content class="card bg-surface-50-950 border-surface-300-700 min-w-[200px] border shadow-lg">
							<div class="py-1" tabindex="-1" role="presentation" onmousedown={preventFocusLoss}>
								<div class="text-surface-600-400 px-2 py-1 text-xs font-semibold uppercase">{group.label()}</div>

								{#if group.id === 'matrices'}
									<div class="border-surface-300-700 border-b p-3">
										<div class="mb-2 text-xs font-medium">{m.mathtoolbar_matrix_style_label()}</div>
										<div class="mb-3 flex flex-wrap gap-2">
											{#each MATRIX_BRACKETS as b (b.mode)}
												<button
													type="button"
													class="rounded border px-2 py-1 text-xs transition-colors"
													class:preset-tonal-primary={matrixBracketMode === b.mode}
													class:border-blue-400={matrixBracketMode === b.mode}
													class:bg-surface-100-900={matrixBracketMode !== b.mode}
													class:border-surface-300-700={matrixBracketMode !== b.mode}
													onclick={() => (matrixBracketMode = b.mode)}
													onmousedown={preventFocusLoss}
													tabindex="-1"
													title={b.title()}
												>
													{b.label}
												</button>
											{/each}
										</div>
										<div class="mb-2 text-xs font-medium">{m.mathtoolbar_matrix_size_label()}</div>
										<div class="space-y-2">
											<div class="grid gap-1" style="grid-template-columns: repeat(6, 1fr);">
												{#each Array.from({ length: 6 }) as _, row}
													{#each Array.from({ length: 6 }) as _, col}
														<button
															type="button"
															class="aspect-square w-full rounded border text-xs transition-colors"
															class:preset-tonal-primary={row + 1 <= matrixGridHoverRows && col + 1 <= matrixGridHoverCols}
															class:border-blue-400={row + 1 <= matrixGridHoverRows && col + 1 <= matrixGridHoverCols}
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
															onclick={() => insertCustomMatrix(row + 1, col + 1)}
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
										{#each group.symbols as symbol}
											<button
												type="button"
												class="env-btn bg-surface-100-900"
												tabindex="-1"
												onmousedown={preventFocusLoss}
												onclick={() => insertSymbol(symbol.latex)}
												title={symbolTooltip(symbol) || symbol.latex}
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
										{#each group.symbols as symbol}
											<button
												type="button"
												class="symbol-btn bg-surface-100-900"
												tabindex="-1"
												onmousedown={preventFocusLoss}
												onclick={() => insertSymbol(symbol.latex)}
												title={symbolTooltip(symbol) || symbol.latex}
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
						</Popover.Content>
					</Popover.Positioner>
				</Portal>
			</Popover>
		</li>
	{/each}

	<li class="border-surface-300-700 h-6 border-r"></li>

	<li>
		<button
			class="toolbarButton rounded p-1 hover:preset-tonal"
			tabindex="-1"
			onmousedown={preventFocusLoss}
			onclick={toggleVirtualKeyboard}
			aria-label={m.mathtoolbar_toggle_keyboard_aria()}
			title={m.mathtoolbar_virtual_keyboard_title()}
		>
			<Keyboard class="h-5 w-5" />
		</button>
	</li>

	{#if isBlockMath}
		<li class="border-surface-300-700 h-6 border-r"></li>
		<li>
			<button
				class="toolbarButton rounded p-1 hover:preset-tonal"
				tabindex="-1"
				onmousedown={preventFocusLoss}
				onclick={selectBlockMath}
				aria-label={m.mathtoolbar_select_block_aria()}
				title={m.mathtoolbar_select_equation_block_title()}
			>
				<BoxSelect class="h-5 w-5" />
			</button>
		</li>
	{/if}
</ul>

<style lang="postcss">
	@reference "../../../../app.css";

	.symbol-grid {
		display: grid;
		gap: 4px;
		grid-template-columns: repeat(4, 80px);
		padding: 6px;
		max-height: 60vh;
		overflow-y: auto;
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
		gap: 2px;
		padding: 6px;
		width: 260px;
		max-height: 60vh;
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

	.env-btn:active {
		@apply bg-blue-300;
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
		width: 80px;
		height: 80px;
		border-radius: 4px;
		border: 1px solid transparent;
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
		width: 66px;
		height: 66px;
		padding: 4px;
	}

	.symbol-grid[data-group='matrices'] .symbol-content {
		font-size: 1.1rem;
	}

	.symbol-grid[data-group='greek'] .symbol-btn {
		width: 56px;
		height: 56px;
	}

	.symbol-grid[data-group='greek'] .symbol-content {
		font-size: 1.8rem;
	}

	.symbol-btn:hover {
		background: var(--color-blue-200, #bfdbfe);
		border-color: var(--color-blue-400, #60a5fa);
	}

	.symbol-btn:active {
		@apply bg-blue-300;
	}
</style>
