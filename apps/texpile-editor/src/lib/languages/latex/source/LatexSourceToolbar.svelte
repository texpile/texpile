<script lang="ts">
	// Source-mode toolbar: buttons for the same LaTeX-wrapping shortcuts formatShortcuts() binds
	// (Mod-b/i/u/`/./,/Shift-b/Shift-`/Alt-1-2-3/m/Shift-m), for people who don't know the chords.
	// unlike the Visual toolbar, buttons don't show an "active" state, which would need re-parsing
	// the buffer around the cursor on every selection change, not worth it for a first pass.
	//
	// The three source toolbars (tex here, MarkdownSourceToolbar, TypstSourceToolbar) share one
	// group layout: format (inline wraps) | headings | blocks (lists, quote, code, math) |
	// inserts (link, table, image, hr). Each writes its own dialect's syntax.
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
		Sigma,
		Link as LinkIcon,
		Image as ImageIcon,
		Minus
	} from '@lucide/svelte';
	import type { EditorState, TransactionSpec } from '@codemirror/state';
	import { sourceCmView } from '$lib/stores/editorStore';
	import { computeToggleWrap, computeWrapBlock, computeLink } from '$lib/languages/latex/intellisense/shortcuts';
	import SourceTableDropdown from '$lib/editor/source/toolbar/SourceTableDropdown.svelte';
	import SourceMathDropdown from '$lib/editor/source/toolbar/SourceMathDropdown.svelte';
	import ToolbarOverflow from '$lib/editor/visual/toolbar/ToolbarOverflow.svelte';
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

	const HEADINGS = [
		{ label: 'H1', macro: 'section' },
		{ label: 'H2', macro: 'subsection' },
		{ label: 'H3', macro: 'subsubsection' }
	];
</script>

<div class="flex min-w-0 flex-1 items-center gap-1 sm:gap-1.5" data-keep-caret role="presentation" onmousedown={(e) => e.preventDefault()}>
	{#snippet st_format()}
		<ul class="border-surface-300-700 flex items-center gap-1 border-r pr-1.5 sm:gap-1.5 sm:pr-2">
			<li class="toolbarButton hover:preset-tonal">
				<button
					onclick={run((s) => computeToggleWrap(s, 'textbf'))}
					class="flex items-center p-1"
					aria-label={m.srctoolbar_bold_aria()}
					use:tip={m.srctoolbar_bold_title()}
				>
					<Bold class="h-4.5 w-4.5" />
				</button>
			</li>
			<li class="toolbarButton hover:preset-tonal">
				<button
					onclick={run((s) => computeToggleWrap(s, 'textit'))}
					class="flex items-center p-1"
					aria-label={m.srctoolbar_italic_aria()}
					use:tip={m.srctoolbar_italic_title()}
				>
					<Italic class="h-4.5 w-4.5" />
				</button>
			</li>
			<li class="toolbarButton hover:preset-tonal">
				<button
					onclick={run((s) => computeToggleWrap(s, 'underline'))}
					class="flex items-center p-1"
					aria-label={m.srctoolbar_underline_aria()}
					use:tip={m.srctoolbar_underline_title()}
				>
					<Underline class="h-4.5 w-4.5 translate-y-[1px]" />
				</button>
			</li>
			<li class="toolbarButton hover:preset-tonal">
				<button
					onclick={run((s) => computeToggleWrap(s, 'texttt'))}
					class="flex items-center p-1"
					aria-label={m.srctoolbar_monospace_aria()}
					use:tip={m.srctoolbar_monospace_title()}
				>
					<Code class="h-4.5 w-4.5" />
				</button>
			</li>
			<li class="toolbarButton hover:preset-tonal">
				<button
					onclick={run((s) => computeToggleWrap(s, 'textsuperscript'))}
					class="flex items-center p-1"
					aria-label={m.srctoolbar_superscript_aria()}
					use:tip={m.srctoolbar_superscript_title()}
				>
					<Superscript class="h-4.5 w-4.5" />
				</button>
			</li>
			<li class="toolbarButton hover:preset-tonal">
				<button
					onclick={run((s) => computeToggleWrap(s, 'textsubscript'))}
					class="flex items-center p-1"
					aria-label={m.srctoolbar_subscript_aria()}
					use:tip={m.srctoolbar_subscript_title()}
				>
					<Subscript class="h-4.5 w-4.5" />
				</button>
			</li>
		</ul>
	{/snippet}
	{#snippet st_headings()}
		<ul class="border-surface-300-700 flex items-center gap-1 border-r pr-1.5 sm:gap-1.5 sm:pr-2">
			{#each HEADINGS as h (h.macro)}
				<li class="toolbarButton hover:preset-tonal">
					<button
						onclick={run((s) => computeWrapBlock(s, `\\${h.macro}{`, '}'))}
						class="flex h-6 min-w-6 items-center justify-center px-1 text-xs font-semibold"
						aria-label={h.label}
						use:tip={h.label}
					>
						{h.label}
					</button>
				</li>
			{/each}
		</ul>
	{/snippet}
	{#snippet st_blocks()}
		<ul class="border-surface-300-700 flex items-center gap-1 border-r pr-1.5 sm:gap-1.5 sm:pr-2">
			<li class="toolbarButton hover:preset-tonal">
				<button
					onclick={run((s) => computeWrapBlock(s, '\\begin{itemize}\n  \\item ', '\n\\end{itemize}'))}
					class="flex items-center p-1"
					aria-label={m.blockmenu_bullet_list()}
					use:tip={m.blockmenu_bullet_list()}
				>
					<List class="h-4.5 w-4.5" />
				</button>
			</li>
			<li class="toolbarButton hover:preset-tonal">
				<button
					onclick={run((s) => computeWrapBlock(s, '\\begin{enumerate}\n  \\item ', '\n\\end{enumerate}'))}
					class="flex items-center p-1"
					aria-label={m.blockmenu_numbered_list()}
					use:tip={m.blockmenu_numbered_list()}
				>
					<ListOrdered class="h-4.5 w-4.5" />
				</button>
			</li>
			<li class="toolbarButton hover:preset-tonal">
				<button
					onclick={run((s) => computeWrapBlock(s, '\\begin{quote}\n', '\n\\end{quote}'))}
					class="flex items-center p-1"
					aria-label={m.srctoolbar_quote_block_aria()}
					use:tip={m.srctoolbar_quote_title()}
				>
					<Quote class="h-4.5 w-4.5" />
				</button>
			</li>
			<li class="toolbarButton hover:preset-tonal">
				<button
					onclick={run((s) => computeWrapBlock(s, '\\begin{verbatim}\n', '\n\\end{verbatim}'))}
					class="flex items-center p-1"
					aria-label={m.srctoolbar_verbatim_block_aria()}
					use:tip={m.srctoolbar_verbatim_title()}
				>
					<Code class="h-4.5 w-4.5" />
				</button>
			</li>
			<li class="toolbarButton hover:preset-tonal">
				<button
					onclick={run((s) => computeWrapBlock(s, '\\(', '\\)'))}
					class="flex items-center p-1"
					aria-label={m.srctoolbar_inline_math_aria()}
					use:tip={m.srctoolbar_inline_math_title()}
				>
					<Sigma class="h-4.5 w-4.5" />
				</button>
			</li>
			<li><SourceMathDropdown /></li>
		</ul>
	{/snippet}
	{#snippet st_inserts()}
		<ul class="flex items-center gap-1 sm:gap-1.5">
			<li class="toolbarButton hover:preset-tonal">
				<button onclick={run(computeLink)} class="flex items-center p-1" aria-label={m.mdtoolbar_link()} use:tip={m.mdtoolbar_link()}>
					<LinkIcon class="h-4.5 w-4.5" />
				</button>
			</li>
			<li><SourceTableDropdown /></li>
			<li class="toolbarButton hover:preset-tonal">
				<button
					onclick={run((s) => computeWrapBlock(s, '\\includegraphics{', '}'))}
					class="flex items-center p-1"
					aria-label={m.menubar_insert_image()}
					use:tip={m.menubar_insert_image()}
				>
					<ImageIcon class="h-4.5 w-4.5" />
				</button>
			</li>
			<li class="toolbarButton hover:preset-tonal">
				<button
					onclick={run((s) => computeWrapBlock(s, '\\rule{\\linewidth}{0.4pt}', ''))}
					class="flex items-center p-1"
					aria-label={m.mdtoolbar_hr()}
					use:tip={m.mdtoolbar_hr()}
				>
					<Minus class="h-4.5 w-4.5" />
				</button>
			</li>
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
