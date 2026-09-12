<script lang="ts">
	import { tip } from '$lib/components/tooltip.svelte';
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
	let row = $state<HTMLDivElement>();
	$effect(() => {
		if (isActive(entry)) row?.scrollIntoView?.({ block: 'nearest' });
	});
</script>

<div>
	<!-- accent TEXT only while the tree has focus: it promises Ctrl+Z acts on files, not the document -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		bind:this={row}
		class="group flex rounded-base text-sm transition-colors {editor.renaming === entry.path
			? 'flex-col items-stretch'
			: 'items-center'} {isActive(entry)
			? `bg-primary-tint font-medium ${focused ? 'text-primary-ink' : ''}`
			: sel.selected.includes(entry.path)
				? 'bg-surface-strong-wash'
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
				{#if sel.expanded[entry.path]}<ChevronDown class="text-faint size-3.5 shrink-0" />{:else}<ChevronRight
						class="text-faint size-3.5 shrink-0"
					/>{/if}
				<FileIcon name={entry.name} folder={sel.expanded[entry.path] ? 'open' : 'closed'} class="size-4 shrink-0" />
			{:else}
				<!-- the slot a directory puts its chevron in; for a file it holds the main-file star, so
				     the mark sits in one column instead of trailing a name of whatever length -->
				<span class="flex w-3.5 shrink-0 items-center justify-center">
					{#if isMain(entry)}
						<Star class="fill-primary-500 text-primary-ink size-3" aria-label={m.filetree_main_file_label()} />
					{/if}
				</span>
				<FileIcon name={entry.name} class="size-4 shrink-0" />
			{/if}
			{#if editor.renaming === entry.path}
				<!-- size=1 for the same reason as the create input in FileTree: the default width would widen the tree -->
				<input
					class="input h-6 min-w-0 flex-1 py-0 text-sm {editor.renameError ? 'border-error-500 text-error-ink' : ''}"
					size={1}
					aria-invalid={!!editor.renameError}
					use:tip={editor.renameError ?? undefined}
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
				<span class="whitespace-nowrap {status ? STATUS_COLOR[status] : ''}" use:tip={status ? STATUS_TITLE[status] : undefined}
					>{entry.name}</span
				>
			{/if}
		</button>
		{#if editor.renaming !== entry.path}
			<!-- one slot, not three: the row's actions live in the context menu this opens, so hovering
			     never widens the row.
			     sticky: rows can be wider than the pane, and parked at the row's end this would sit off
			     screen until you scrolled to it. -->
			{@const fill = isActive(entry)
				? 'bg-primary-tint-solid'
				: sel.selected.includes(entry.path)
					? 'bg-surface-strong-wash-solid'
					: 'bg-surface-200-800'}
			<span class="sticky right-0 z-10 flex w-0 shrink-0 items-center justify-end">
				<button
					class="btn-icon btn-icon-xs text-muted hover:text-surface-950-50 mr-1 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 {fill}"
					use:tip={m.filetree_row_actions()}
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
		<!-- spelled out under the field, not only in the hover hint: Enter on a taken name refuses
		     silently, and a red border alone does not say why -->
		{#if editor.renaming === entry.path && editor.renameError}
			<span class="text-error-ink max-w-56 pb-1 text-[11px] leading-tight" style="padding-left: {depth * 12 + 24}px"
				>{editor.renameError}</span
			>
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
