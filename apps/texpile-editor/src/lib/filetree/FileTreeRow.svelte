<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ChevronRight, ChevronDown, MoreHorizontal, Star } from '@lucide/svelte';
	import FileIcon from './FileIcon.svelte';
	import FileTreeRow from './FileTreeRow.svelte';
	import type { TreeEntry } from '$lib/workspace/fileSystem';
	import type { GitBadge } from '$lib/workspace/git';
	import type { FileTreeState } from './treeState.svelte';
	import type { FileTreeDnd } from './treeDnd.svelte';
	import type { TreeNameEditor } from './treeNameEditor.svelte';
	import { gitBadgeOf, STATUS_COLOR, STATUS_TITLE } from './treeBadges';
	import { focusSelect } from './focusSelect';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		entry: TreeEntry;
		depth: number;
		sel: FileTreeState;
		dnd: FileTreeDnd;
		editor: TreeNameEditor;
		/** the tree owns keyboard focus, so the accent promises Ctrl+Z acts on files */
		focused: boolean;
		gitStatus: Record<string, GitBadge>;
		isActive: (e: TreeEntry) => boolean;
		isMain: (e: TreeEntry) => boolean;
		onOpen: (entry: TreeEntry) => void;
		openCtx: (e: MouseEvent, entry: TreeEntry) => void;
		createInput: Snippet<[number]>;
	};

	let { entry, depth, sel, dnd, editor, focused, gitStatus, isActive, isMain, onOpen, openCtx, createInput }: Props = $props();
</script>

<div>
	<!-- accent TEXT only while the tree has focus: it promises Ctrl+Z acts on files, not the document -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="group flex items-center rounded text-sm transition-colors {isActive(entry)
			? `bg-primary-500/15 font-medium ${focused ? 'text-primary-700 dark:text-primary-300' : ''}`
			: sel.selected.includes(entry.path)
				? 'bg-surface-300-700/60'
				: 'hover:bg-surface-200-800'} {dnd.dropTarget === entry.path && entry.type === 'dir'
			? 'ring-primary-500 ring-2 ring-inset'
			: ''} {dnd.dragPaths.includes(entry.path) ? 'opacity-50' : ''}"
		draggable={editor.renaming !== entry.path}
		ondragstart={(e) => dnd.onRowDragStart(e, entry)}
		ondragover={(e) => dnd.onRowDragOver(e, entry)}
		ondrop={(e) => dnd.onRowDrop(e, entry)}
		ondragend={() => dnd.onDragEnd()}
		oncontextmenu={(e) => openCtx(e, entry)}
	>
		<button
			class="flex flex-1 items-center gap-1 py-0.5"
			style="padding-left: {depth * 12 + 4}px"
			onclick={(e) => sel.handleRowClick(e, entry)}
			ondblclick={() => entry.type === 'file' && onOpen(entry)}
		>
			{#if entry.type === 'dir'}
				{#if sel.expanded[entry.path]}<ChevronDown class="text-surface-400 size-3.5 shrink-0" />{:else}<ChevronRight
						class="text-surface-400 size-3.5 shrink-0"
					/>{/if}
				<FileIcon name={entry.name} folder={sel.expanded[entry.path] ? 'open' : 'closed'} class="size-4 shrink-0" />
			{:else}
				<!-- the slot a directory puts its chevron in; for a file it holds the main-file star, so
				     the mark sits in one column instead of trailing a name of whatever length -->
				<span class="flex w-3.5 shrink-0 items-center justify-center">
					{#if isMain(entry)}
						<Star class="fill-primary-500 text-primary-500 size-3" aria-label={m.filetree_main_file_label()} />
					{/if}
				</span>
				<FileIcon name={entry.name} class="size-4 shrink-0" />
			{/if}
			{#if editor.renaming === entry.path}
				<input
					class="input h-6 min-w-0 flex-1 py-0 text-sm"
					value={editor.renameValue}
					oninput={(e) => {
						editor.renameValue = e.currentTarget.value;
						editor.renameEdited = true;
					}}
					use:focusSelect
					draggable="false"
					onpointerdown={(e) => e.stopPropagation()}
					onclick={(e) => e.stopPropagation()}
					onkeydown={(e) => {
						if (e.key === 'Enter') editor.commitRename(entry);
						else if (e.key === 'Escape') editor.renaming = null;
					}}
					onblur={(e) => editor.blurRename(e, entry)}
				/>
			{:else}
				{@const status = gitBadgeOf(gitStatus, entry)}
				<!-- names are never trimmed; the tree scrolls sideways instead (see FileTree's min-w-max).
				     git status is the name's own colour, so it needs no column of its own -->
				<span class="whitespace-nowrap {status ? STATUS_COLOR[status] : ''}" title={status ? STATUS_TITLE[status] : undefined}
					>{entry.name}</span
				>
			{/if}
		</button>
		{#if editor.renaming !== entry.path}
			<!-- one slot, not three: the row's actions live in the context menu this opens, so hovering
			     never widens the row. `hidden`, not opacity-0, so it reserves no width when not hovered.
			     sticky: rows can be wider than the pane, and parked at the row's end this would sit off
			     screen until you scrolled to it.
			     No fill of its own, deliberately. It used to carry one so that a name scrolled under
			     it could not show through - but a second painted surface over an already-lit row is
			     visible however carefully its colour is matched: instant against the row's fade,
			     square against the row's rounded ends. A name bleeding through while the tree is
			     scrolled sideways is the cheaper of the two. -->
			<span class="sticky right-0 z-10 hidden shrink-0 items-center bg-transparent pr-1 group-hover:flex">
				<!-- the icon answers the hover, not a second fill: the row is already lit, and
				     preset-tonal washed 10% white over it, leaving a paler rounded patch with a
				     visible seam against the row it sits on -->
				<button
					class="btn-icon btn-icon-xs text-surface-500 hover:text-surface-950-50 bg-transparent transition-colors"
					title={m.filetree_row_actions()}
					aria-label={m.filetree_row_actions()}
					onclick={(e) => {
						e.stopPropagation();
						openCtx(e, entry);
					}}
				>
					<MoreHorizontal class="size-3.5" />
				</button>
			</span>
		{/if}
	</div>

	{#if entry.type === 'dir' && sel.expanded[entry.path]}
		{#if editor.creatingIn === entry.path}{@render createInput(depth + 1)}{/if}
		{#each entry.children ?? [] as child (child.path)}
			<FileTreeRow
				entry={child}
				depth={depth + 1}
				{sel}
				{dnd}
				{editor}
				{focused}
				{gitStatus}
				{isActive}
				{isMain}
				{onOpen}
				{openCtx}
				{createInput}
			/>
		{/each}
	{/if}
</div>
