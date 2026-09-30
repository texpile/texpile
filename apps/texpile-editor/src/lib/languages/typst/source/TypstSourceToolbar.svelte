<script lang="ts">
	// Typst source-mode toolbar: the typst sibling of MarkdownSourceToolbar. The SHELL mirrors the
	// LaTeX SourceToolbar (groups, borders, icon metrics); every action writes Typst markup into
	// the CodeMirror view. No active-state highlighting, same trade-off as the other source bars.
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
		Omega,
		Image as ImageIcon,
		Minus
	} from '@lucide/svelte';
	import type { EditorState, TransactionSpec } from '@codemirror/state';
	import { sourceCmView } from '$lib/stores/editorStore';
	import SourceToolbarButton, { type SourceToolbarButtonProps } from '$lib/editor/source/toolbar/SourceToolbarButton.svelte';
	import ToolbarOverflow from '$lib/editor/visual/toolbar/ToolbarOverflow.svelte';
	import TypstSourceTableDropdown from './TypstSourceTableDropdown.svelte';
	import { symbolPicker } from '$lib/editor/symbols/symbolPicker.svelte';
	import { typstSymbolSet } from '../symbols/typstSymbolSet';
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

	function openSymbols(e: MouseEvent) {
		e.preventDefault();
		void symbolPicker.show(typstSymbolSet);
	}
</script>

{#snippet button(item: { payload?: unknown })}
	<SourceToolbarButton {...item.payload as SourceToolbarButtonProps} />
{/snippet}
{#snippet table()}<TypstSourceTableDropdown />{/snippet}

<div class="flex min-w-0 flex-1 items-center gap-1 sm:gap-1.5" data-keep-caret role="presentation" onmousedown={(e) => e.preventDefault()}>
	<ToolbarOverflow
		gapClass="gap-1 sm:gap-1.5"
		menuLabel={m.toolbar_more_actions_aria()}
		items={[
			{
				id: 'bold',
				render: button,
				payload: { label: m.srctoolbar_bold_aria(), action: run((s) => computeToggleDelim(s, '*')), Icon: Bold }
			},
			{
				id: 'italic',
				render: button,
				payload: { label: m.srctoolbar_italic_aria(), action: run((s) => computeToggleDelim(s, '_')), Icon: Italic }
			},
			{
				id: 'underline',
				render: button,
				// nudged down 1px, lucide's U glyph rides high of the other icons' center line
				payload: {
					label: m.srctoolbar_underline_aria(),
					action: run((s) => computeWrap(s, '#underline[', ']')),
					Icon: Underline,
					iconClass: 'h-4.5 w-4.5 translate-y-[1px]'
				}
			},
			{
				id: 'monospace',
				render: button,
				payload: { label: m.srctoolbar_monospace_aria(), action: run((s) => computeToggleDelim(s, '`')), Icon: Code }
			},
			{
				id: 'superscript',
				render: button,
				payload: { label: m.srctoolbar_superscript_aria(), action: run((s) => computeWrap(s, '#super[', ']')), Icon: Superscript }
			},
			{
				id: 'subscript',
				render: button,
				payload: { label: m.srctoolbar_subscript_aria(), action: run((s) => computeWrap(s, '#sub[', ']')), Icon: Subscript }
			},
			...[1, 2, 3].map((level) => ({
				id: `h${level}`,
				render: button,
				payload: {
					label: m.mdtoolbar_heading_n({ n: level }),
					text: `H${level}`,
					action: run((s) => computeHeadingLine(s, level)),
					divider: level === 1
				}
			})),
			{
				id: 'bullet',
				render: button,
				payload: { label: m.blockmenu_bullet_list(), action: run((s) => computeListLines(s, '- ')), Icon: List, divider: true }
			},
			{
				id: 'ordered',
				render: button,
				payload: { label: m.blockmenu_numbered_list(), action: run((s) => computeListLines(s, '+ ')), Icon: ListOrdered }
			},
			{
				id: 'quote',
				render: button,
				payload: { label: m.blockmenu_quote(), action: run((s) => computeWrap(s, '#quote(block: true)[', ']')), Icon: Quote }
			},
			{ id: 'codeBlock', render: button, payload: { label: m.blockmenu_code_block(), action: run(computeFence), Icon: Code } },
			{
				id: 'inlineMath',
				render: button,
				payload: { label: m.srctoolbar_inline_math_aria(), action: run((s) => computeToggleDelim(s, '$')), Icon: Sigma }
			},
			{ id: 'mathBlock', render: button, payload: { label: m.blockmenu_math_block(), action: run(computeMathBlock), Icon: SquareRadical } },
			// Omega, as on the LaTeX bar: Sigma already means "wrap in inline math"
			{ id: 'symbols', render: button, payload: { label: m.symbols_title(), action: openSymbols, Icon: Omega } },
			{ id: 'link', render: button, payload: { label: m.mdtoolbar_link(), action: run(computeLink), Icon: LinkIcon, divider: true } },
			{ id: 'table', render: table },
			{ id: 'image', render: button, payload: { label: m.menubar_insert_image(), action: run(computeFigureSkeleton), Icon: ImageIcon } },
			{ id: 'hr', render: button, payload: { label: m.mdtoolbar_hr(), action: run(computeHr), Icon: Minus } }
		]}
	/>
</div>
