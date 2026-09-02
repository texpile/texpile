<script lang="ts">
	// Markdown source-mode toolbar: buttons for the same md-wrapping chords mdSourceShortcuts()
	// binds, for people who don't know them. The SHELL mirrors the LaTeX SourceToolbar (groups,
	// borders, icon metrics); the actions write markdown, not LaTeX. No active-state highlighting,
	// same trade-off as the tex source bar.
	import { tip } from '$lib/components/tooltip.svelte';
	import {
		Bold,
		Italic,
		Strikethrough,
		Code,
		List,
		ListOrdered,
		Quote,
		Link as LinkIcon,
		SquareRadical,
		Sigma,
		Table as TableIcon,
		Image as ImageIcon,
		Minus
	} from '@lucide/svelte';
	import type { EditorState, TransactionSpec } from '@codemirror/state';
	import { sourceCmView } from '$lib/stores/editorStore';
	import ToolbarOverflow from '$lib/editor/visual/toolbar/ToolbarOverflow.svelte';
	import {
		computeToggleDelim,
		computeHeadingLine,
		computeListLines,
		computeQuoteLines,
		computeFence,
		computeLink,
		computeImage,
		computeMathBlock,
		computeTableSkeleton,
		computeHr
	} from './sourceInsert';
	import { m } from '$lib/paraglide/messages';

	function run(build: (state: EditorState) => TransactionSpec) {
		return (e: MouseEvent) => {
			e.preventDefault(); // keep focus (and the caret) in the CodeMirror view
			const view = sourceCmView.current;
			if (!view) return;
			view.dispatch(build(view.state));
			view.focus();
		};
	}
</script>

{#snippet iconButton(label: string, action: (e: MouseEvent) => void, IconComp: typeof Bold)}
	<li class="toolbarButton hover:preset-tonal">
		<button onclick={action} class="flex items-center p-1" aria-label={label} use:tip={label}>
			<IconComp class="h-4.5 w-4.5" />
		</button>
	</li>
{/snippet}

<div class="flex min-w-0 flex-1 items-center gap-1 sm:gap-1.5" data-keep-caret role="presentation" onmousedown={(e) => e.preventDefault()}>
	{#snippet st_format()}
		<ul class="border-surface-300-700 flex items-center gap-1 border-r pr-1.5 sm:gap-1.5 sm:pr-2">
			{@render iconButton(
				m.srctoolbar_bold_aria(),
				run((s) => computeToggleDelim(s, '**')),
				Bold
			)}
			{@render iconButton(
				m.srctoolbar_italic_aria(),
				run((s) => computeToggleDelim(s, '*')),
				Italic
			)}
			{@render iconButton(
				m.mdtoolbar_strike(),
				run((s) => computeToggleDelim(s, '~~')),
				Strikethrough
			)}
			{@render iconButton(
				m.srctoolbar_monospace_aria(),
				run((s) => computeToggleDelim(s, '`')),
				Code
			)}
		</ul>
	{/snippet}
	{#snippet st_headings()}
		<ul class="border-surface-300-700 flex items-center gap-1 border-r pr-1.5 sm:gap-1.5 sm:pr-2">
			{#each [1, 2, 3] as level (level)}
				<li class="toolbarButton hover:preset-tonal">
					<button
						onclick={run((s) => computeHeadingLine(s, level))}
						class="flex items-center p-1 text-xs font-semibold"
						aria-label={m.mdtoolbar_heading_n({ n: level })}
						use:tip={m.mdtoolbar_heading_n({ n: level })}
					>
						H{level}
					</button>
				</li>
			{/each}
		</ul>
	{/snippet}
	{#snippet st_blocks()}
		<ul class="border-surface-300-700 flex items-center gap-1 border-r pr-1.5 sm:gap-1.5 sm:pr-2">
			{@render iconButton(
				m.blockmenu_bullet_list(),
				run((s) => computeListLines(s, 'bullet')),
				List
			)}
			{@render iconButton(
				m.blockmenu_numbered_list(),
				run((s) => computeListLines(s, 'ordered')),
				ListOrdered
			)}
			{@render iconButton(m.blockmenu_quote(), run(computeQuoteLines), Quote)}
			{@render iconButton(m.blockmenu_code_block(), run(computeFence), Code)}
			{@render iconButton(
				m.srctoolbar_inline_math_aria(),
				run((s) => computeToggleDelim(s, '$')),
				Sigma
			)}
			{@render iconButton(m.blockmenu_math_block(), run(computeMathBlock), SquareRadical)}
		</ul>
	{/snippet}
	{#snippet st_inserts()}
		<ul class="flex items-center gap-1 sm:gap-1.5">
			{@render iconButton(m.mdtoolbar_link(), run(computeLink), LinkIcon)}
			{@render iconButton(m.blockmenu_table(), run(computeTableSkeleton), TableIcon)}
			{@render iconButton(m.menubar_insert_image(), run(computeImage), ImageIcon)}
			{@render iconButton(m.mdtoolbar_hr(), run(computeHr), Minus)}
		</ul>
	{/snippet}

	<ToolbarOverflow
		gapClass="gap-1 sm:gap-1.5"
		menuLabel={m.toolbar_more_actions_aria()}
		items={[
			{ id: 'format', pinned: true, render: st_format },
			{ id: 'headings', pinned: true, render: st_headings },
			{ id: 'blocks', render: st_blocks },
			{ id: 'inserts', render: st_inserts }
		]}
	/>
</div>

<style lang="postcss">
	@reference "../../../../app.css";

	.toolbarButton {
		@apply rounded-base transition-all ease-in-out;
	}
</style>
