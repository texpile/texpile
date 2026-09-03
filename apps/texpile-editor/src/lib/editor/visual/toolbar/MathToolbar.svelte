<script lang="ts" module>
	// paletteOpen keeps Toolbar from unmounting us: Zag hands focus to the closing popover's trigger
	// on the next frame, which blurs the mathfield, and Toolbar drops this toolbar the instant a
	// mathfield isn't focused. Without it the palette vanishes under the user's cursor mid-click.
	export const mathToolbarState = $state<{ aiInputActive: boolean; paletteOpen: boolean; openGroup: string | null }>({
		aiInputActive: false,
		paletteOpen: false,
		/** which symbol group the docked panel is showing; EditorPane renders it */
		openGroup: null
	});
</script>

<script lang="ts">
	import { tip } from '$lib/components/tooltip.svelte';
	import { ChevronDown, BoxSelect } from '@lucide/svelte';
	import { editorViewStore } from '$lib/stores/editorStore';
	import { TextSelection } from 'prosemirror-state';
	import { m } from '$lib/paraglide/messages';
	import ToolbarOverflow from './ToolbarOverflow.svelte';
	import MathSymbolPanel from './MathSymbolPanel.svelte';
	import { SYMBOL_GROUPS } from './mathSymbols';

	let activeMathfieldRef: HTMLElement | null = $state(null);

	// Track the focused mathfield through an EVENT, not a read of document.activeElement: that is not
	// reactive, so the effect this replaces ran once at mount and never again. Inserting a symbol
	// makes ProseMirror rebuild the math node, which throws away the element this pointed at - after
	// which every insert targeted a detached field and did nothing at all, silently. Repro was two
	// symbols in a row: the first worked, the second vanished.
	$effect(() => {
		function onFocusIn(e: FocusEvent) {
			if (e.target instanceof window.MathfieldElement) activeMathfieldRef = e.target;
		}
		document.addEventListener('focusin', onFocusIn, true);
		if (document.activeElement instanceof window.MathfieldElement) activeMathfieldRef = document.activeElement;
		return () => document.removeEventListener('focusin', onFocusIn, true);
	});

	let isBlockMath = $derived.by(() => {
		if (!activeMathfieldRef) return false;
		return activeMathfieldRef.closest('.block-math-container') !== null;
	});

	function selectBlockMath() {
		const view = editorViewStore.current;
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

	/** where the dropdown hangs: the rect of whichever group button opened it */
	let anchor = $state({ top: 0, left: 0 });

	function toggleGroup(groupId: string, trigger?: HTMLElement) {
		if (trigger) {
			const r = trigger.getBoundingClientRect();
			// clamped so a group near the right edge does not open off-screen
			anchor = { top: r.bottom + 4, left: Math.max(4, Math.min(r.left, window.innerWidth - 340)) };
		}
		// A plain toggle now. The old version captured the mathfield and its caret here because the
		// popover was about to take focus away; the docked panel never does, so there is nothing to
		// save and nothing to put back.
		mathToolbarState.openGroup = mathToolbarState.openGroup === groupId ? null : groupId;
		mathToolbarState.paletteOpen = mathToolbarState.openGroup !== null;
	}

	// Virtual keyboard disabled (desktop app, physical keyboard always present). Kept for reference
	// along with virtualKeyboardConfig.ts; re-add the toolbar item to bring it back.
	// function toggleVirtualKeyboard() {
	// if (window.mathVirtualKeyboard?.visible) {
	// window.mathVirtualKeyboard.hide();
	// } else {
	// window.mathVirtualKeyboard.show();
	// }
	// // resolved live rather than from a cached ref, same as everything else here
	// const mf = liveMathfield();
	// if (mf instanceof window.MathfieldElement) mf.focus();
	// }
	//
</script>

{#snippet symbolGroup(item: { payload?: unknown })}
	{@const group = item.payload as (typeof SYMBOL_GROUPS)[number]}
	{@const Icon = group.icon}
	<div>
		<button
			class="toolbarButton flex items-center gap-1 rounded-base p-1 hover:preset-tonal"
			class:preset-tonal-primary={mathToolbarState.openGroup === group.id}
			aria-label={group.label()}
			use:tip={group.label()}
			aria-pressed={mathToolbarState.openGroup === group.id}
			tabindex="-1"
			onmousedown={preventFocusLoss}
			onpointerdown={(e) => {
				e.preventDefault();
				toggleGroup(group.id, e.currentTarget as HTMLElement);
			}}
		>
			<Icon class="h-5 w-5" />
			<ChevronDown class="size-3 opacity-60" />
		</button>
	</div>
{/snippet}

{#snippet blockMathItem()}
	<div class="flex items-center gap-1 sm:gap-1.5">
		<span class="border-surface-300-700 h-6 border-r"></span>
		<button
			class="btn-icon btn-icon-xs toolbarButton hover:preset-tonal"
			tabindex="-1"
			onmousedown={preventFocusLoss}
			onclick={selectBlockMath}
			aria-label={m.mathtoolbar_select_block_aria()}
			use:tip={m.mathtoolbar_select_equation_block_title()}
		>
			<BoxSelect class="h-5 w-5" />
		</button>
	</div>
{/snippet}

{#if mathToolbarState.openGroup}
	<MathSymbolPanel
		groupId={mathToolbarState.openGroup}
		top={anchor.top}
		left={anchor.left}
		onClose={() => {
			mathToolbarState.openGroup = null;
			mathToolbarState.paletteOpen = false;
		}}
	/>
{/if}

<!-- data-math-toolbar: Toolbar checks for it before concluding the user left the equation -->
<div data-math-toolbar class="flex min-w-0 flex-1 items-center">
	<ToolbarOverflow
		gapClass="gap-1 sm:gap-1.5 2xl:gap-2"
		menuLabel={m.toolbar_more_actions_aria()}
		items={[
			...SYMBOL_GROUPS.map((g) => ({ id: g.id, payload: g, render: symbolGroup })),
			// virtual keyboard disabled: desktop app, physical keyboard always present
			// { id: 'keyboard', pinned: true, render: keyboardItem },
			...(isBlockMath ? [{ id: 'blockmath', pinned: true, render: blockMathItem }] : [])
		]}
	/>
</div>

<style lang="postcss">
	@reference "../../../../app.css";

	.symbol-grid {
		display: grid;
		gap: calc(var(--spacing) * 1);
		grid-template-columns: repeat(4, 80px);
		padding: calc(var(--spacing) * 1.5);
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
		gap: calc(var(--spacing) * 0.5);
		padding: calc(var(--spacing) * 1.5);
		width: calc(var(--spacing) * 65);
		max-height: 60vh;
		overflow-y: auto;
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
		color: var(--muted-text);
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
