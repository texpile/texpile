<script lang="ts">
	// The tex editor's toolbar. The three visual toolbars (tex here, MarkdownToolbar,
	// TypstToolbar) share one SHELL - search + undo/redo groups, the same ToolbarOverflow gaps
	// and button metrics - and one canonical item ORDER: heading | bold italic underline/strike |
	// sup/sub colors | inline code, link | lists | quote | math table code-block hr | select
	// block. Each bar renders only what its schema can hold, but an item present in two bars
	// must sit in the same place and behave the same way in both.
	import { tip } from '$lib/components/tooltip.svelte';
	import {
		Search,
		Undo,
		Redo,
		Bold,
		Underline,
		Italic,
		Code,
		List,
		ListOrdered,
		Link as LinkIcon,
		Quote,
		Minus,
		BoxSelect,
		Eye
	} from '@lucide/svelte';
	import { selectParentNode, toggleMark } from 'prosemirror-commands';
	import { undo, redo } from 'prosemirror-history';
	import { createWrapInListCommand } from 'prosemirror-flat-list';
	import type { EditorState, Transaction } from 'prosemirror-state';
	import ToolbarTable from '$lib/editor/visual/toolbar/ToolbarTable.svelte';
	import TextColorDropdown from '$lib/editor/visual/toolbar/TextColorDropdown.svelte';
	import HighlightDropdown from '$lib/editor/visual/toolbar/HighlightDropdown.svelte';
	import { markIsActive, activeMarkColor, toggleLinkCommand } from '$lib/editor/visual/toolbar/markState';
	import { displaySearchBarStore, editorViewStore, rawEditorActiveStore } from '$lib/editor/../stores/editorStore';
	import { schema } from '$lib/languages/latex/schema/latexPMSchema';
	import { setHeadingLevel, toggleBlockQuote } from '$lib/editor/visual/helperCommands';
	import HeadingDropdown from '$lib/editor/visual/toolbar/HeadingDropdown.svelte';
	import SupSubDropdown from '$lib/editor/visual/toolbar/SupSubDropdown.svelte';
	import { createCodeBlock } from '$lib/editor/visual/extensions/codemirrorbridge/cmcommands';
	import MathDropdown from '$lib/editor/visual/toolbar/MathDropdown.svelte';
	import MathToolbar, { mathToolbarState } from '$lib/editor/visual/toolbar/MathToolbar.svelte';
	import ToolbarOverflow from '$lib/editor/visual/toolbar/ToolbarOverflow.svelte';
	import { isReadOnly } from '$lib/stores/permissionStore';
	import { onMount } from 'svelte';
	import { m } from '$lib/paraglide/messages';

	let isMathfieldActive = $state(false);

	// Whether a mathfield is focused - which decides whether MathToolbar exists at all.
	//
	// Focus landing on the math toolbar's own palette does NOT mean the user left their equation.
	// Treating it as such unmounted the toolbar between mousedown and click on a symbol button: the
	// button was gone before the click could dispatch, so nothing inserted and nothing reported it,
	// because the handler never ran. Repro was two symbols in a row - the second one vanished.
	function updateMathfieldState() {
		setTimeout(() => {
			const active = document.activeElement;
			if (active instanceof window.MathfieldElement) {
				isMathfieldActive = true;
				return;
			}
			// our own palette (portalled, hence [data-scope]) or anything inside this toolbar: the user
			// is still working on the equation, so hold the previous answer rather than tearing down
			if (active instanceof Element && active.closest('[data-scope], [data-math-toolbar]')) return;
			isMathfieldActive = false;
		}, 0);
	}

	onMount(() => {
		window.addEventListener('focusin', updateMathfieldState);
		// custom event, see the monkey patch in mlview.ts
		window.addEventListener('ml:focusin', updateMathfieldState);
		window.addEventListener('focusout', updateMathfieldState);
		return () => {
			window.removeEventListener('focusin', updateMathfieldState);
			window.removeEventListener('ml:focusin', updateMathfieldState);
			window.removeEventListener('focusout', updateMathfieldState);
		};
	});

	type Cmd = (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean;
	function keepEditorFocus(cmd: Cmd) {
		return (e: MouseEvent) => {
			e.preventDefault();
			if (!editorViewStore.current) return;
			cmd(editorViewStore.current!.state, editorViewStore.current!.dispatch);
			editorViewStore.current!.focus();
		};
	}
	// preventDefault on mousedown anywhere in the toolbar so clicks never steal focus from
	// PM/mathfield; otherwise Skeleton's Popover loses the focus race on close and the next
	// keystroke goes nowhere. click handlers still fire.
	function preventEditorFocusLoss(e: MouseEvent) {
		e.preventDefault();
	}

	type ActiveCommandsType = { strong?: boolean; em?: boolean; u?: boolean; code?: boolean; link?: boolean; sup?: boolean; sub?: boolean };
	let activeCommands: ActiveCommandsType = $state({});
	let activeTextColor = $state<string | null>(null);
	let activeHighlightColor = $state<string | null>(null);
	let currentHeadingLevel = $state(0);
	let currentHeadingNumbered = $state(true);

	$effect(() => {
		if (editorViewStore.current) {
			activeCommands = {
				strong: markIsActive(editorViewStore.current!.state, schema.marks.strong),
				em: markIsActive(editorViewStore.current!.state, schema.marks.em),
				u: markIsActive(editorViewStore.current!.state, schema.marks.u),
				code: markIsActive(editorViewStore.current!.state, schema.marks.code),
				link: markIsActive(editorViewStore.current!.state, schema.marks.link),
				sup: markIsActive(editorViewStore.current!.state, schema.marks.sup),
				sub: markIsActive(editorViewStore.current!.state, schema.marks.sub)
			};

			activeTextColor = activeMarkColor(editorViewStore.current!.state, schema.marks.textcolor);
			activeHighlightColor = activeMarkColor(editorViewStore.current!.state, schema.marks.highlight);

			const node = editorViewStore.current!.state.selection.$from.node(editorViewStore.current!.state.selection.$from.depth);
			const inHeading = node?.type?.name === 'heading';
			currentHeadingLevel = inHeading ? node.attrs.level : 0;
			currentHeadingNumbered = inHeading ? node.attrs.numbered !== false : true;
		}
	});

	function applyHeading(level: number, numbered: boolean) {
		setHeadingLevel(level, numbered)(editorViewStore.current!.state, editorViewStore.current!.dispatch);
		editorViewStore.current!.focus();
	}

	const bulletList = createWrapInListCommand({ kind: 'bullet' });
	const orderedList = createWrapInListCommand({ kind: 'ordered' });

	function insertHr(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
		dispatch?.(state.tr.replaceSelectionWith(schema.nodes.horizontal_rule.create()).scrollIntoView());
		return true;
	}
</script>

{#snippet iconButton(label: string, isActive: boolean, cmd: Cmd, IconComp: typeof Bold, iconClass = 'h-5 w-5')}
	<div class={`toolbarButton ${isActive ? 'preset-tonal-primary' : 'hover:preset-tonal'}`}>
		<button onclick={keepEditorFocus(cmd)} class="flex items-center p-1" aria-label={label} use:tip={label}>
			<IconComp class={iconClass} />
		</button>
	</div>
{/snippet}

<div class="flex min-w-0 flex-1 items-center gap-3 sm:gap-4" data-keep-caret role="presentation" onmousedown={preventEditorFocusLoss}>
	<div class="flex min-w-0 flex-1 items-center">
		<!-- item gaps and divider padding use the same step per breakpoint, so the border sits centered in its gap -->
		<div class="text-surface-800-200 flex min-h-9 min-w-0 flex-1 items-center gap-2 sm:gap-3 2xl:gap-4">
			<ul class="border-surface-300-700 flex shrink-0 items-center gap-2 border-r pr-2 sm:gap-3 sm:pr-3 2xl:gap-4 2xl:pr-4">
				<li class="toolbarButton hover:preset-tonal">
					<button
						onclick={() => {
							displaySearchBarStore.current = !displaySearchBarStore.current;
						}}
						class="flex items-center p-1"
					>
						<Search class="h-5 w-5" />
					</button>
				</li>
			</ul>

			{#if isReadOnly.current}
				<div class="text-muted flex items-center gap-1.5">
					<Eye class="size-4" />
					<span class="text-sm font-medium">{m.toolbar_read_only()}</span>
				</div>
			{:else}
				<ul class="border-surface-300-700 flex shrink-0 items-center gap-2 border-r pr-2 sm:gap-3 sm:pr-3 2xl:gap-4 2xl:pr-4">
					<li class="toolbarButton hover:preset-tonal">
						<button onclick={keepEditorFocus(undo)} class="flex items-center p-1" aria-label={m.toolbar_undo_aria()}>
							<Undo class="h-5 w-5" />
						</button>
					</li>
					<li class="toolbarButton hover:preset-tonal">
						<button onclick={keepEditorFocus(redo)} class="flex items-center p-1" aria-label={m.toolbar_redo_aria()}>
							<Redo class="h-5 w-5" />
						</button>
					</li>
				</ul>

				{#if rawEditorActiveStore.current}
					<!-- a raw-LaTeX CM block is focused: prose formatting doesn't apply, show a minimal bar -->
					<!-- Sheds the hint first, then the whole indicator - icon included. A bare icon left
					     behind reads as a button you can press, and this is a status label, not a control.
					     Container queries, not sm:, which measures the WINDOW: a wide window with a narrow
					     editor pane kept showing the hint and it wrapped onto a second line. -->
					<div class="text-muted hidden min-h-9 min-w-0 items-center gap-2 text-sm whitespace-nowrap @sm:flex">
						<Code class="size-4 shrink-0" />
						<span class="font-medium">{m.toolbar_latex_code()}</span>
						<span class="text-muted hidden @xl:inline">{m.toolbar_latex_code_hint()}</span>
					</div>
				{:else if isMathfieldActive || mathToolbarState.aiInputActive || mathToolbarState.paletteOpen}
					<MathToolbar />
				{:else}
					{#snippet tb_heading()}
						<div>
							<HeadingDropdown level={currentHeadingLevel} numbered={currentHeadingNumbered} onSelect={applyHeading} />
						</div>
					{/snippet}
					{#snippet tb_bold()}
						{@render iconButton(m.toolbar_bold_aria(), !!activeCommands.strong, toggleMark(schema.marks.strong), Bold)}
					{/snippet}
					{#snippet tb_italic()}
						{@render iconButton(m.toolbar_italic_aria(), !!activeCommands.em, toggleMark(schema.marks.em), Italic)}
					{/snippet}
					{#snippet tb_underline()}
						<!-- nudged down 1.5px, lucide's U glyph rides high of the other icons' center line -->
						{@render iconButton(
							m.toolbar_underline_aria(),
							!!activeCommands.u,
							toggleMark(schema.marks.u),
							Underline,
							'h-5 w-5 translate-y-[1.5px]'
						)}
					{/snippet}
					{#snippet tb_supsub()}
						<div>
							<SupSubDropdown
								sup={!!activeCommands.sup}
								sub={!!activeCommands.sub}
								onToggle={(which) => {
									toggleMark(schema.marks[which])(editorViewStore.current!.state, editorViewStore.current!.dispatch);
									editorViewStore.current!.focus();
								}}
							/>
						</div>
					{/snippet}
					{#snippet tb_textcolor()}
						<div>
							<TextColorDropdown {activeTextColor} />
						</div>
					{/snippet}
					{#snippet tb_highlight()}
						<div>
							<HighlightDropdown {activeHighlightColor} />
						</div>
					{/snippet}
					{#snippet tb_codeMark()}
						{@render iconButton(m.menubar_format_inline_code(), !!activeCommands.code, toggleMark(schema.marks.code), Code)}
					{/snippet}
					{#snippet tb_link()}
						{@render iconButton(m.mdtoolbar_link(), !!activeCommands.link, toggleLinkCommand(schema.marks.link), LinkIcon)}
					{/snippet}
					{#snippet tb_bullet()}
						{@render iconButton(m.blockmenu_bullet_list(), false, bulletList, List)}
					{/snippet}
					{#snippet tb_ordered()}
						{@render iconButton(m.blockmenu_numbered_list(), false, orderedList, ListOrdered)}
					{/snippet}
					{#snippet tb_quote()}
						<!-- toggleBlockQuote, not wrapIn: the Format menu toggles, and a second press
						     must unquote rather than nest a quote inside a quote -->
						{@render iconButton(m.blockmenu_quote(), false, toggleBlockQuote(), Quote)}
					{/snippet}
					{#snippet tb_math()}
						<div>
							<MathDropdown />
						</div>
					{/snippet}
					{#snippet tb_table()}
						<div>
							<ToolbarTable />
						</div>
					{/snippet}
					{#snippet tb_codeBlock()}
						{@render iconButton(m.toolbar_insert_code_block_aria(), false, createCodeBlock(), Code)}
					{/snippet}
					{#snippet tb_hr()}
						{@render iconButton(m.mdtoolbar_hr(), false, insertHr, Minus)}
					{/snippet}
					{#snippet tb_selectblock()}
						{@render iconButton(m.toolbar_select_block_aria(), false, selectParentNode, BoxSelect)}
					{/snippet}

					<ToolbarOverflow
						gapClass="gap-3 2xl:gap-4"
						menuLabel={m.toolbar_more_actions_aria()}
						items={[
							{ id: 'heading', pinned: true, render: tb_heading },
							{ id: 'bold', pinned: true, render: tb_bold },
							{ id: 'italic', pinned: true, render: tb_italic },
							{ id: 'underline', pinned: true, render: tb_underline },
							{ id: 'supsub', render: tb_supsub },
							{ id: 'textcolor', render: tb_textcolor },
							{ id: 'highlight', render: tb_highlight },
							{ id: 'codeMark', render: tb_codeMark },
							{ id: 'link', render: tb_link },
							{ id: 'bullet', render: tb_bullet },
							{ id: 'ordered', render: tb_ordered },
							{ id: 'quote', render: tb_quote },
							{ id: 'math', render: tb_math },
							{ id: 'table', render: tb_table },
							{ id: 'codeBlock', render: tb_codeBlock },
							{ id: 'hr', render: tb_hr },
							{ id: 'selectblock', render: tb_selectblock }
						]}
					/>
				{/if}
			{/if}
		</div>
	</div>
</div>

<style lang="postcss">
	@reference "../../../../app.css";

	.toolbarButton {
		@apply rounded-base transition-all ease-in-out;
	}
</style>
