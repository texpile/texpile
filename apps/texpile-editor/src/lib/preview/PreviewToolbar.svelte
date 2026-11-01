<script module lang="ts">
	import type { Snippet } from 'svelte';

	/** where a group is being drawn: on the bar, or as a row of the "..." menu */
	export type PreviewToolbarPlace = 'bar' | 'menu';
	/** one control group; `pinned` keeps it on the bar at every width, `inMenu` keeps it in the "..." at
	 *  every width, `alignEnd` moves it
	 *  and what follows to the right edge of a left-laid bar (the editor column) */
	export type PreviewToolbarGroup = {
		id: string;
		pinned?: boolean;
		inMenu?: boolean;
		foldsFirst?: boolean;
		alignEnd?: boolean;
		render: Snippet<[PreviewToolbarPlace]>;
	};
</script>

<script lang="ts">
	// The one row every preview wears: the PDF viewer, the live LaTeX preview and the Typst preview
	// each hand it their groups and get the same band, control size, dividers and the trailing "..."
	// that swallows groups from the right as the pane narrows.
	//
	// `leading`/`trailing` render OUTSIDE the collapsing groups: whatever the host pins at the edges
	// is never what gets dropped when the bar runs out of room.
	// `asTabStrip`: this bar is its pane's ONLY row, standing where a tab strip would, so it takes
	// that height.
	// `inEditor`: in the format toolbar's box, so the column keeps its shape across a tab switch.
	// Not the app's ToolbarOverflow: this bar can live in the popped-out window, and that one
	// measures against the opener's.
	import { MoreHorizontal } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { floatingBarClass, hangFindBelow } from '$lib/editor/floatingBar';
	import { menuPanelClass } from '$lib/menus/menuStyles';
	import { CollapsingToolbar } from '$lib/pdf-view/collapsingToolbar.svelte';

	let {
		groups,
		leading,
		trailing,
		asTabStrip = false,
		inEditor = false,
		leadIsControls = false
	}: {
		groups: PreviewToolbarGroup[];
		leading?: Snippet;
		/** the lead holds buttons, not a name to truncate: it keeps its width and the groups fold first */
		leadIsControls?: boolean;
		trailing?: Snippet;
		asTabStrip?: boolean;
		inEditor?: boolean;
	} = $props();

	// last group first, pinned ones never
	const bar = new CollapsingToolbar(() => {
		const folding = groups.filter((g) => !g.pinned && !g.inMenu);
		return [...folding.filter((g) => g.foldsFirst), ...folding.filter((g) => !g.foldsFirst).reverse()].map((g) => g.id);
	});
	const hidden = $derived(new Set([...bar.hidden, ...groups.filter((g) => g.inMenu).map((g) => g.id)]));
	const groupIds = $derived(groups.map((g) => g.id).join());
	$effect(() => {
		void groupIds;
		bar.refit();
	});
</script>

<div
	class="preview-toolbar {inEditor ? floatingBarClass : ''}"
	class:as-tab-strip={asTabStrip}
	class:in-editor={inEditor}
	bind:this={bar.row}
	{@attach inEditor ? hangFindBelow : undefined}
>
	<!-- the lead zone stays as a spacer with a trailing control alone, so the groups keep their centre -->
	{#if leading || trailing}<div class="preview-toolbar-lead" class:keeps={leadIsControls}>
			{#if leading}{@render leading()}{/if}
		</div>{/if}
	{#each groups as group (group.id)}
		{#if !hidden.has(group.id)}
			<div class="preview-toolbar-group" class:align-end={group.alignEnd}>
				{@render group.render('bar')}
			</div>
		{/if}
	{/each}
	{#if hidden.size > 0}
		<div class="preview-toolbar-group preview-overflow">
			<button
				bind:this={bar.menu.button}
				onclick={bar.menu.toggle}
				aria-label="More actions"
				use:tip={'More actions'}
				aria-expanded={bar.menu.open}
			>
				<MoreHorizontal size={16} />
			</button>
			{#if bar.menu.open}
				<!-- one group per row: a group parked here for good draws itself as a labeled item, a group
				     folded for want of width keeps its bar shape -->
				<div
					bind:this={bar.menu.el}
					class="{menuPanelClass} preview-overflow-menu"
					style={bar.menu.style}
					role="group"
					{@attach bar.menu.moveToBody}
				>
					{#each groups as group (group.id)}
						{#if hidden.has(group.id)}<div class="preview-toolbar-group">{@render group.render('menu')}</div>{/if}
					{/each}
				</div>
			{/if}
		</div>
	{/if}
	{#if trailing}<div class="preview-toolbar-trail">{@render trailing()}</div>{/if}
</div>

<style>
	@reference "../../app.css";

	.preview-toolbar {
		--pdf-ctl: calc(var(--spacing) * 7);
		/* Compile in the lead drops its label in a narrow pane (CompileButton's @max query) */
		container-type: inline-size;
		display: flex;
		/* the groups and the trailing control pack against the right edge and the lead takes the room;
		   safe: a row that still overflows aligns from the start, so nothing is clipped past the left
		   edge and the scrollWidth test that drives the "..." keeps working */
		justify-content: safe flex-end;
		align-items: center;
		box-sizing: border-box;
		gap: calc(var(--spacing) * 2);
		color: var(--pdf-toolbar-fg);
		flex-shrink: 0;
		/* never wraps to a second row (it shifted the whole viewer down and read as a layout
		   glitch) and never scrolls either: a bar that does not fit collapses into the "..." */
		flex-wrap: nowrap;
		overflow: hidden;
	}

	.preview-toolbar:not(.in-editor) {
		min-height: calc(var(--spacing) * 10);
		padding: 0 calc(var(--spacing) * 2);
		border-bottom: var(--default-border-width) solid var(--pdf-toolbar-border);
	}

	/* the preview pane has no tab strip of its own, so this bar takes its height and their bottom
	   borders draw one line across the split */
	.preview-toolbar.as-tab-strip {
		--pdf-ctl: calc(var(--spacing) * 6);
		min-height: calc(var(--spacing) * 9);
		background-color: var(--pdf-toolbar-bg);
	}

	/* fixed, not absolute: the bar is an overflow-x container and clips a menu hanging below it,
	   so the button appeared to do nothing at all. coordinates come from the button's rect. */
	.preview-overflow-menu {
		--pdf-ctl: calc(var(--spacing) * 7);
		position: fixed;
		z-index: 1200;
		min-width: calc(var(--spacing) * 44);
		max-width: min(22rem, calc(100vw - 1rem));
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: calc(var(--spacing) * 1);
	}

	/* the lead is the one zone that gives way: it grows into the room and its text truncates. The
	   groups never shrink, so a bar that runs out of room still overflows into the "..." */
	.preview-toolbar-lead,
	.preview-toolbar-trail {
		display: flex;
		align-items: center;
		gap: calc(var(--spacing) * 2);
	}
	.preview-toolbar-lead {
		flex: 1 1 0;
		min-width: 0;
	}
	.preview-toolbar-lead.keeps {
		flex: 1 0 auto;
	}
	.preview-toolbar-trail {
		flex: 0 0 auto;
	}
	/* in the editor column it lays out like the editor toolbars: controls from the left, "..." at the right edge */
	.preview-toolbar.in-editor {
		justify-content: flex-start;
	}

	.preview-toolbar.in-editor::before {
		margin-right: calc(var(--spacing) * -2);
	}
	.preview-toolbar.in-editor .preview-overflow,
	.preview-toolbar.in-editor .preview-toolbar-group.align-end {
		margin-left: auto;
	}
	/* the room goes before the first align-end group, so the "..." after it stays close */
	.preview-toolbar.in-editor .preview-toolbar-group.align-end ~ .preview-overflow {
		margin-left: 0;
	}

	.preview-toolbar-group {
		display: flex;
		align-items: center;
		gap: calc(var(--spacing) * 1);
		flex-shrink: 0;
	}

	/* a hairline between groups, centred in the row gap like the editor toolbar's. Direct children
	   only: the same groups re-rendered inside the "..." menu stack, where a divider means nothing */
	.preview-toolbar > .preview-toolbar-group + .preview-toolbar-group {
		border-left: var(--default-border-width) solid var(--pdf-toolbar-divider);
		padding-left: calc(var(--spacing) * 2);
	}

	.preview-toolbar.in-editor > .preview-toolbar-group.align-end,
	.preview-toolbar.in-editor > .preview-toolbar-group.align-end ~ .preview-toolbar-group {
		border-left: 0;
		padding-left: 0;
	}

	/* the controls come from whichever preview filled the groups, so they are reached as globals;
	   direct children only, a nested component (the zoom menu) styles its own */
	.preview-toolbar-group > :global(button),
	.preview-toolbar-lead > :global(button),
	.preview-toolbar-trail > :global(button) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: var(--pdf-ctl);
		height: var(--pdf-ctl);
		padding: 0;
		border: var(--default-border-width) solid var(--pdf-toolbar-btn-border);
		background-color: var(--pdf-toolbar-btn-bg);
		color: var(--pdf-toolbar-btn-fg);
		border-radius: calc(var(--radius-base) * 1.5);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.preview-toolbar-group > :global(button:hover:not(:disabled)),
	.preview-toolbar-lead > :global(button:hover:not(:disabled)),
	.preview-toolbar-trail > :global(button:hover:not(:disabled)) {
		background-color: var(--pdf-toolbar-btn-hover-bg);
		border-color: var(--pdf-toolbar-btn-hover-border);
		color: var(--pdf-toolbar-fg);
	}

	.preview-toolbar-group > :global(button:active:not(:disabled)),
	.preview-toolbar-lead > :global(button:active:not(:disabled)),
	.preview-toolbar-trail > :global(button:active:not(:disabled)) {
		background-color: var(--pdf-toolbar-btn-active-bg);
	}

	/* a toggle that is on (follow the caret, fit width): the app's active pairing, the accent on a
	   grey ground did not clear the bar in dark mode */
	.preview-toolbar-group > :global(button[aria-pressed='true']) {
		background-color: var(--primary-tint);
		border-color: transparent;
		color: var(--primary-ink);
	}

	.preview-toolbar-group > :global(button:disabled),
	.preview-toolbar-trail > :global(button:disabled) {
		opacity: 0.4;
		cursor: not-allowed;
	}

	/* a button that carries text (the zoom percentage) */
	.preview-toolbar-group > :global(button.wide) {
		width: auto;
		min-width: calc(var(--spacing) * 11);
		padding: 0 calc(var(--spacing) * 2);
		font-size: 0.8rem;
		font-variant-numeric: tabular-nums;
	}

	/* a row of the "..." menu: icon, then its name, across the full width. The icon sits where a
	   folded group's first icon sits, centred in its control square, so the column lines up */
	.preview-overflow-menu > .preview-toolbar-group > :global(button.menu-item) {
		width: 100%;
		height: var(--pdf-ctl);
		justify-content: flex-start;
		gap: calc(var(--spacing) * 2);
		padding: 0 calc(var(--spacing) * 2) 0 calc((var(--pdf-ctl) - 1rem) / 2);
		font-size: var(--text-sm);
		white-space: nowrap;
	}

	.preview-overflow-menu > .preview-toolbar-group > :global(button.menu-item:hover:not(:disabled)) {
		@apply preset-tonal;
		border-color: transparent;
	}

	/* a row of the "..." that is on says so with a check at its end, as the app's other menus do; the bar's
	   tint read as a pill inside the menu */
	.preview-overflow-menu > .preview-toolbar-group > :global(button.menu-item[aria-pressed='true']:not(:hover)) {
		background-color: transparent;
		color: inherit;
	}

	/* a readout beside the controls: 1 / 20, 75% */
	.preview-toolbar :global(.preview-toolbar-readout),
	.preview-overflow-menu :global(.preview-toolbar-readout) {
		font-size: 0.8rem;
		min-width: calc(var(--spacing) * 11);
		text-align: center;
		font-variant-numeric: tabular-nums;
	}

	.preview-toolbar-group > :global(input[type='text']),
	.preview-toolbar-group > :global(input[type='number']) {
		height: var(--pdf-ctl);
		padding: 0 calc(var(--spacing) * 2);
		border: var(--default-border-width) solid var(--pdf-toolbar-input-border);
		border-radius: calc(var(--radius-base) * 1.5);
		background-color: var(--pdf-toolbar-input-bg);
		color: var(--pdf-toolbar-fg);
		font-family: inherit;
		font-size: 0.8rem;
		outline: none;
		transition:
			border-color 0.15s,
			box-shadow 0.15s;
	}

	.preview-toolbar-group > :global(input[type='text']:focus),
	.preview-toolbar-group > :global(input[type='number']:focus) {
		border-color: var(--pdf-toolbar-accent);
		box-shadow: 0 0 0 2px var(--pdf-toolbar-accent-ring);
	}

	/* a square with a bold digit in it read as a badge */
	.preview-toolbar-group > :global(input.page-input) {
		width: max(calc(var(--pdf-ctl) * 1.35), calc(var(--digits, 1) * 1ch + var(--spacing) * 3));
		padding: 0;
		font-weight: 400;
		text-align: center;
		appearance: textfield;
		-moz-appearance: textfield;
	}

	.preview-toolbar-group > :global(input.page-input::-webkit-outer-spin-button),
	.preview-toolbar-group > :global(input.page-input::-webkit-inner-spin-button) {
		-webkit-appearance: none;
		margin: 0;
	}
</style>
