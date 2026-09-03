<script lang="ts">
	// The markdown editor's own toolbar, over mdSchema only — no LaTeX vocabulary, no tex schema
	// imports. The SHELL deliberately mirrors the tex Toolbar (same search + undo/redo groups,
	// same ToolbarOverflow gaps, same button metrics), so switching file kinds doesn't feel like
	// switching apps; only the item set is markdown-shaped.
	import { tip } from '$lib/components/tooltip.svelte';
	import {
		Search,
		Undo,
		Redo,
		Bold,
		Italic,
		Strikethrough,
		Code,
		List,
		ListOrdered,
		ListChecks,
		Link as LinkIcon,
		Quote,
		Minus,
		BoxSelect
	} from '@lucide/svelte';
	import { selectParentNode, toggleMark } from 'prosemirror-commands';
	import { undo, redo } from 'prosemirror-history';
	import { createWrapInListCommand } from 'prosemirror-flat-list';
	import type { EditorState, Transaction } from 'prosemirror-state';
	import { mdSchema } from './schema';
	import MarkdownToolbarTable from './MarkdownToolbarTable.svelte';
	import MdHeadingDropdown from './MdHeadingDropdown.svelte';
	import { markIsActive, toggleLinkCommand } from '$lib/editor/visual/toolbar/markState';
	import { displaySearchBarStore, editorViewStore, rawEditorActiveStore } from '$lib/stores/editorStore';
	import MathToolbar, { mathToolbarState } from '$lib/editor/visual/toolbar/MathToolbar.svelte';
	import MathDropdown from '$lib/editor/visual/toolbar/MathDropdown.svelte';
	import ToolbarOverflow from '$lib/editor/visual/toolbar/ToolbarOverflow.svelte';
	import { setHeadingLevel, toggleBlockQuote } from '$lib/editor/visual/helperCommands';
	import { createCodeBlock } from '$lib/editor/visual/extensions/codemirrorbridge/cmcommands';
	import { onMount } from 'svelte';
	import { m } from '$lib/paraglide/messages';

	let isMathfieldActive = $state(false);
	// same debounced focus tracking as the tex toolbar; see its comment on palette focus
	function updateMathfieldState() {
		setTimeout(() => {
			const active = document.activeElement;
			if (active instanceof window.MathfieldElement) {
				isMathfieldActive = true;
				return;
			}
			if (active instanceof Element && active.closest('[data-scope], [data-math-toolbar]')) return;
			isMathfieldActive = false;
		}, 0);
	}
	onMount(() => {
		window.addEventListener('focusin', updateMathfieldState);
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
			cmd(editorViewStore.current.state, editorViewStore.current.dispatch);
			editorViewStore.current.focus();
		};
	}
	// keep the caret in the editor when the toolbar chrome itself is clicked
	function preventEditorFocusLoss(e: MouseEvent) {
		e.preventDefault();
	}

	let active = $state<{ strong?: boolean; em?: boolean; s?: boolean; code?: boolean; link?: boolean }>({});
	let headingLevel = $state(0);
	$effect(() => {
		if (!editorViewStore.current) return;
		const st = editorViewStore.current.state;
		active = {
			strong: markIsActive(st, mdSchema.marks.strong),
			em: markIsActive(st, mdSchema.marks.em),
			s: markIsActive(st, mdSchema.marks.s),
			code: markIsActive(st, mdSchema.marks.code),
			link: markIsActive(st, mdSchema.marks.link)
		};
		const node = st.selection.$from.node(st.selection.$from.depth);
		headingLevel = node?.type?.name === 'heading' ? Number(node.attrs.level) : 0;
	});

	function applyHeading(level: number) {
		if (!editorViewStore.current) return;
		setHeadingLevel(level)(editorViewStore.current.state, editorViewStore.current.dispatch);
		editorViewStore.current.focus();
	}

	function insertHr(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
		dispatch?.(state.tr.replaceSelectionWith(mdSchema.nodes.horizontal_rule.create()).scrollIntoView());
		return true;
	}

	const bulletList = createWrapInListCommand({ kind: 'bullet' });
	const orderedList = createWrapInListCommand({ kind: 'ordered' });
	const taskList = createWrapInListCommand({ kind: 'task', checked: false });
</script>

{#snippet iconButton(label: string, isActive: boolean, cmd: Cmd, IconComp: typeof Bold)}
	<div class={`toolbarButton ${isActive ? 'preset-tonal-primary' : 'hover:preset-tonal'}`}>
		<button onclick={keepEditorFocus(cmd)} class="flex items-center p-1" aria-label={label} use:tip={label}>
			<IconComp class="h-5 w-5" />
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
				<!-- a raw CM island is focused: prose formatting doesn't apply -->
				<div class="text-muted hidden min-h-9 min-w-0 items-center gap-2 text-sm whitespace-nowrap @sm:flex">
					<Code class="size-4 shrink-0" />
					<span class="font-medium">{m.toolbar_latex_code()}</span>
				</div>
			{:else if isMathfieldActive || mathToolbarState.aiInputActive || mathToolbarState.paletteOpen}
				<MathToolbar />
			{:else}
				{#snippet tb_heading()}
					<div>
						<MdHeadingDropdown level={headingLevel} onSelect={applyHeading} />
					</div>
				{/snippet}
				{#snippet tb_bold()}
					{@render iconButton(m.toolbar_bold_aria(), !!active.strong, toggleMark(mdSchema.marks.strong), Bold)}
				{/snippet}
				{#snippet tb_italic()}
					{@render iconButton(m.toolbar_italic_aria(), !!active.em, toggleMark(mdSchema.marks.em), Italic)}
				{/snippet}
				{#snippet tb_strike()}
					{@render iconButton(m.mdtoolbar_strike(), !!active.s, toggleMark(mdSchema.marks.s), Strikethrough)}
				{/snippet}
				{#snippet tb_codeMark()}
					{@render iconButton(m.menubar_format_inline_code(), !!active.code, toggleMark(mdSchema.marks.code), Code)}
				{/snippet}
				{#snippet tb_link()}
					{@render iconButton(m.mdtoolbar_link(), !!active.link, toggleLinkCommand(mdSchema.marks.link), LinkIcon)}
				{/snippet}
				{#snippet tb_bullet()}
					{@render iconButton(m.blockmenu_bullet_list(), false, bulletList, List)}
				{/snippet}
				{#snippet tb_ordered()}
					{@render iconButton(m.blockmenu_numbered_list(), false, orderedList, ListOrdered)}
				{/snippet}
				{#snippet tb_task()}
					{@render iconButton(m.mdtoolbar_task_list(), false, taskList, ListChecks)}
				{/snippet}
				{#snippet tb_quote()}
					<!-- toggleBlockQuote, not wrapIn: a second press must unquote, not nest -->
					{@render iconButton(m.blockmenu_quote(), false, toggleBlockQuote(), Quote)}
				{/snippet}
				{#snippet tb_math()}
					<div>
						<MathDropdown />
					</div>
				{/snippet}
				{#snippet tb_table()}
					<div>
						<MarkdownToolbarTable />
					</div>
				{/snippet}
				{#snippet tb_codeBlock()}
					{@render iconButton(m.blockmenu_code_block(), false, createCodeBlock(), Code)}
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
						{ id: 'strike', pinned: true, render: tb_strike },
						{ id: 'codeMark', render: tb_codeMark },
						{ id: 'link', render: tb_link },
						{ id: 'bullet', render: tb_bullet },
						{ id: 'ordered', render: tb_ordered },
						{ id: 'task', render: tb_task },
						{ id: 'quote', render: tb_quote },
						{ id: 'math', render: tb_math },
						{ id: 'table', render: tb_table },
						{ id: 'codeBlock', render: tb_codeBlock },
						{ id: 'hr', render: tb_hr },
						{ id: 'selectblock', render: tb_selectblock }
					]}
				/>
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
