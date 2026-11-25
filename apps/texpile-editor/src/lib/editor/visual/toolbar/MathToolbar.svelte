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
	import { activeMath } from './activeMath.svelte';
	import { TextSelection } from 'prosemirror-state';
	import { m } from '$lib/paraglide/messages';
	import ToolbarOverflow from './ToolbarOverflow.svelte';
	import MathSymbolPanel from './MathSymbolPanel.svelte';
	import { SYMBOL_GROUPS } from './mathSymbols';

	const isBlockMath = $derived(activeMath.current?.display ?? false);

	/** the whole display as a text range, so the format bar's own commands act on it */
	function selectBlockMath() {
		const math = activeMath.current;
		if (!math?.display) return;
		const { view } = math;
		const from = math.pos();
		const node = view.state.doc.nodeAt(from);
		if (node?.type.name !== 'block_math') return;
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, from + node.nodeSize)));
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
			anchor = { top: r.bottom + 4, left: r.left };
		}
		// A plain toggle now. The old version captured the mathfield and its caret here because the
		// popover was about to take focus away; the docked panel never does, so there is nothing to
		// save and nothing to put back.
		mathToolbarState.openGroup = mathToolbarState.openGroup === groupId ? null : groupId;
		mathToolbarState.paletteOpen = mathToolbarState.openGroup !== null;
	}
</script>

{#snippet symbolGroup(item: { payload?: unknown })}
	{@const group = item.payload as (typeof SYMBOL_GROUPS)[number]}
	{@const Icon = group.icon}
	<div>
		<button
			class="toolbarButton rounded-base hover:preset-tonal flex items-center gap-1 p-1"
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
			<ChevronDown class="size-3" />
		</button>
	</div>
{/snippet}

{#snippet blockMathItem()}
	<div class="flex items-center gap-1 sm:gap-1.5">
		<span class="border-surface-300-700 h-6 border-r"></span>
		<button
			class="toolbarButton rounded-base hover:preset-tonal flex items-center p-1"
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
		text-align: left;
	}

	.env-btn:hover {
		background: var(--math-key-hover);
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
	}

	.symbol-btn:active {
		background: var(--math-key-down);
	}
</style>
