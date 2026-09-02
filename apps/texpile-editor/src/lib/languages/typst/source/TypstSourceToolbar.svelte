<script lang="ts">
	// Typst source-mode toolbar: the typst sibling of MarkdownSourceToolbar. The SHELL mirrors the
	// LaTeX SourceToolbar (groups, borders, icon metrics); every action writes Typst markup into
	// the CodeMirror view. No active-state highlighting, same trade-off as the other source bars.
	import { tip } from '$lib/components/tooltip.svelte';
	import {
		Bold,
		Italic,
		Underline,
		Code,
		Superscript,
		Subscript,
		List,
		ListOrdered,
		Quote,
		Link as LinkIcon,
		SquareRadical,
		Sigma,
		Image as ImageIcon,
		Minus
	} from '@lucide/svelte';
	import type { EditorState, TransactionSpec } from '@codemirror/state';
	import { sourceCmView } from '$lib/stores/editorStore';
	import ToolbarOverflow from '$lib/editor/visual/toolbar/ToolbarOverflow.svelte';
	import TypstSourceTableDropdown from './TypstSourceTableDropdown.svelte';
	import {
		computeToggleDelim,
		computeWrap,
		computeHeadingLine,
		computeListLines,
		computeFence,
		computeLink,
		computeMathBlock,
		computeFigureSkeleton,
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

{#snippet iconButton(label: string, action: (e: MouseEvent) => void, IconComp: typeof Bold, iconClass = 'h-4.5 w-4.5')}
	<li class="toolbarButton hover:preset-tonal">
		<button onclick={action} class="flex items-center p-1" aria-label={label} use:tip={label}>
			<IconComp class={iconClass} />
		</button>
	</li>
{/snippet}

<div class="flex min-w-0 flex-1 items-center gap-1 sm:gap-1.5" data-keep-caret role="presentation" onmousedown={(e) => e.preventDefault()}>
	{#snippet st_format()}
		<ul class="border-surface-300-700 flex items-center gap-1 border-r pr-1.5 sm:gap-1.5 sm:pr-2">
			{@render iconButton(
				m.srctoolbar_bold_aria(),
				run((s) => computeToggleDelim(s, '*')),
				Bold
			)}
			{@render iconButton(
				m.srctoolbar_italic_aria(),
				run((s) => computeToggleDelim(s, '_')),
				Italic
			)}
			<!-- nudged down 1px, lucide's U glyph rides high of the other icons' center line -->
			{@render iconButton(
				m.srctoolbar_underline_aria(),
				run((s) => computeWrap(s, '#underline[', ']')),
				Underline,
				'h-4.5 w-4.5 translate-y-[1px]'
			)}
			{@render iconButton(
				m.srctoolbar_monospace_aria(),
				run((s) => computeToggleDelim(s, '`')),
				Code
			)}
			{@render iconButton(
				m.srctoolbar_superscript_aria(),
				run((s) => computeWrap(s, '#super[', ']')),
				Superscript
			)}
			{@render iconButton(
				m.srctoolbar_subscript_aria(),
				run((s) => computeWrap(s, '#sub[', ']')),
				Subscript
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
				run((s) => computeListLines(s, '- ')),
				List
			)}
			{@render iconButton(
				m.blockmenu_numbered_list(),
				run((s) => computeListLines(s, '+ ')),
				ListOrdered
			)}
			{@render iconButton(
				m.blockmenu_quote(),
				run((s) => computeWrap(s, '#quote(block: true)[', ']')),
				Quote
			)}
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
			<li>
				<TypstSourceTableDropdown />
			</li>
			{@render iconButton(m.menubar_insert_image(), run(computeFigureSkeleton), ImageIcon)}
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
