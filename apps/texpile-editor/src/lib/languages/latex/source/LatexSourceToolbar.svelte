<script lang="ts">
	import { withKeyLabel } from '$lib/keybindings/keybindings.svelte';
	// Source-mode toolbar: buttons for the same LaTeX-wrapping shortcuts formatShortcuts() binds
	// (Mod-b/i/u/`/./,/Shift-b/Shift-`/Alt-1-2-3/m/Shift-m), for people who don't know the chords.
	// unlike the Visual toolbar, buttons don't show an "active" state, which would need re-parsing
	// the buffer around the cursor on every selection change, not worth it for a first pass.
	//
	// The three source toolbars (tex here, MarkdownSourceToolbar, TypstSourceToolbar) share one
	// group layout: format (inline wraps) | headings | blocks (lists, quote, code, math) |
	// inserts (link, table, image, hr). Each writes its own dialect's syntax.
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
	import SourceToolbarButton, { type SourceToolbarButtonProps } from '$lib/editor/source/toolbar/SourceToolbarButton.svelte';
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

{#snippet button(item: { payload?: unknown })}
	<SourceToolbarButton {...item.payload as SourceToolbarButtonProps} />
{/snippet}
{#snippet table()}<SourceTableDropdown />{/snippet}
{#snippet math()}<SourceMathDropdown />{/snippet}

<div class="flex min-w-0 flex-1 items-center gap-1 sm:gap-1.5" data-keep-caret role="presentation" onmousedown={(e) => e.preventDefault()}>
	<ToolbarOverflow
		gapClass="gap-1 sm:gap-1.5"
		menuLabel={m.toolbar_more_actions_aria()}
		items={[
			{
				id: 'bold',
				render: button,
				payload: {
					label: m.srctoolbar_bold_aria(),
					title: withKeyLabel((combo) => m.srctoolbar_bold_title({ combo }), 'editor.bold'),
					action: run((s) => computeToggleWrap(s, 'textbf')),
					Icon: Bold
				}
			},
			{
				id: 'italic',
				render: button,
				payload: {
					label: m.srctoolbar_italic_aria(),
					title: withKeyLabel((combo) => m.srctoolbar_italic_title({ combo }), 'editor.italic'),
					action: run((s) => computeToggleWrap(s, 'textit')),
					Icon: Italic
				}
			},
			{
				id: 'underline',
				render: button,
				payload: {
					label: m.srctoolbar_underline_aria(),
					title: withKeyLabel((combo) => m.srctoolbar_underline_title({ combo }), 'editor.underline'),
					action: run((s) => computeToggleWrap(s, 'underline')),
					Icon: Underline,
					iconClass: 'h-4.5 w-4.5 translate-y-[1px]'
				}
			},
			{
				id: 'monospace',
				render: button,
				payload: {
					label: m.srctoolbar_monospace_aria(),
					title: withKeyLabel((combo) => m.srctoolbar_monospace_title({ combo }), 'editor.inlineCode'),
					action: run((s) => computeToggleWrap(s, 'texttt')),
					Icon: Code
				}
			},
			{
				id: 'superscript',
				render: button,
				payload: {
					label: m.srctoolbar_superscript_aria(),
					title: withKeyLabel((combo) => m.srctoolbar_superscript_title({ combo }), 'editor.superscript'),
					action: run((s) => computeToggleWrap(s, 'textsuperscript')),
					Icon: Superscript
				}
			},
			{
				id: 'subscript',
				render: button,
				payload: {
					label: m.srctoolbar_subscript_aria(),
					title: withKeyLabel((combo) => m.srctoolbar_subscript_title({ combo }), 'editor.subscript'),
					action: run((s) => computeToggleWrap(s, 'textsubscript')),
					Icon: Subscript
				}
			},
			...HEADINGS.map((h, i) => ({
				id: h.macro,
				render: button,
				payload: { label: h.label, text: h.label, action: run((s) => computeWrapBlock(s, `\\${h.macro}{`, '}')), divider: i === 0 }
			})),
			{
				id: 'bullet',
				render: button,
				payload: {
					label: m.blockmenu_bullet_list(),
					action: run((s) => computeWrapBlock(s, '\\begin{itemize}\n  \\item ', '\n\\end{itemize}')),
					Icon: List,
					divider: true
				}
			},
			{
				id: 'ordered',
				render: button,
				payload: {
					label: m.blockmenu_numbered_list(),
					action: run((s) => computeWrapBlock(s, '\\begin{enumerate}\n  \\item ', '\n\\end{enumerate}')),
					Icon: ListOrdered
				}
			},
			{
				id: 'quote',
				render: button,
				payload: {
					label: m.srctoolbar_quote_block_aria(),
					title: withKeyLabel((combo) => m.srctoolbar_quote_title({ combo }), 'editor.blockquote'),
					action: run((s) => computeWrapBlock(s, '\\begin{quote}\n', '\n\\end{quote}')),
					Icon: Quote
				}
			},
			{
				id: 'verbatim',
				render: button,
				payload: {
					label: m.srctoolbar_verbatim_block_aria(),
					title: withKeyLabel((combo) => m.srctoolbar_verbatim_title({ combo }), 'editor.codeBlock'),
					action: run((s) => computeWrapBlock(s, '\\begin{verbatim}\n', '\n\\end{verbatim}')),
					Icon: Code
				}
			},
			{
				id: 'inlineMath',
				render: button,
				payload: {
					label: m.srctoolbar_inline_math_aria(),
					title: withKeyLabel((combo) => m.srctoolbar_inline_math_title({ combo }), 'editor.inlineMath'),
					action: run((s) => computeWrapBlock(s, '\\(', '\\)')),
					Icon: Sigma
				}
			},
			{ id: 'math', render: math },
			{ id: 'link', render: button, payload: { label: m.mdtoolbar_link(), action: run(computeLink), Icon: LinkIcon, divider: true } },
			{ id: 'table', render: table },
			{
				id: 'image',
				render: button,
				payload: { label: m.menubar_insert_image(), action: run((s) => computeWrapBlock(s, '\\includegraphics{', '}')), Icon: ImageIcon }
			},
			{
				id: 'hr',
				render: button,
				payload: { label: m.mdtoolbar_hr(), action: run((s) => computeWrapBlock(s, '\\rule{\\linewidth}{0.4pt}', '')), Icon: Minus }
			}
		]}
	/>
</div>
