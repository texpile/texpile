<script lang="ts" module>
	import type { TreeEntry } from '$lib/workspace/fileSystem';

	export type TreeTarget = {
		entry: TreeEntry | null;
		createDir: string;
		pasteDir: string;
		// rows Delete would take, so the label can say "Delete 3 items"
		selectionCount: number;
		isMain: boolean;
		canSetMain: boolean;
		canPaste: boolean;
		canReveal: boolean;
	};
</script>

<script lang="ts">
	import { tip } from '$lib/components/tooltip.svelte';
	import { FilePlus, FolderPlus, FileSymlink, Star, Copy, ClipboardPaste, FolderOpen, Undo2, Redo2, Pencil, Trash2 } from '@lucide/svelte';
	import type { FileHistory } from '$lib/workspace/fileHistory.svelte';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		// file tree undo/redo
		history?: FileHistory | null;
		// if typst then show #include instead of \include
		typstProject?: boolean;
		onCreate?: (dir: string, type: 'file' | 'dir' | 'include') => void;
		onSetMain?: (entry: TreeEntry) => void;
		onCopy?: () => void;
		onPaste?: (dir: string) => void;
		onReveal?: (entry: TreeEntry) => void;
		onRename?: (entry: TreeEntry) => void;
		onDelete?: (entry: TreeEntry) => void;
		onClose?: () => void;
	};
	let {
		history = null,
		typstProject = false,
		onCreate,
		onSetMain,
		onCopy,
		onPaste,
		onReveal,
		onRename,
		onDelete,
		onClose
	}: Props = $props();

	let target = $state<(TreeTarget & { x: number; y: number }) | null>(null);

	// open at pointer
	export function open(event: MouseEvent, at: TreeTarget): void {
		event.preventDefault();
		event.stopPropagation();
		target = {
			...at,
			// clamping to keep the menu on screen; the height is the fullest it gets - new
			// file/folder/include, copy, paste, reveal, undo, redo, set main, rename, delete
			x: Math.min(event.clientX, window.innerWidth - 184),
			y: Math.min(event.clientY, window.innerHeight - 340)
		};
	}

	export function close(): void {
		target = null;
		onClose?.();
	}

	// the tree owns the Escape chain (menu, then inline input, then rename, then selection), so it
	// asks rather than this installing a second window handler that would fire alongside it
	export function isOpen(): boolean {
		return target !== null;
	}

	// clicking away must not pull focus back to the tree, the click has its own target
	function dismiss(): void {
		target = null;
	}

	// close before the action: New File and Rename open an inline input, and the focus hand-back in
	// onClose has to land first for the input to win it
	function runCommands(run: (at: TreeTarget) => void) {
		return () => {
			const at = target;
			close();
			if (at) run(at);
		};
	}

	const itemClass = 'hover:preset-tonal-primary flex w-full items-center gap-2.5 px-3 py-1.5 text-left';
</script>

{#if target}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50"
		onpointerdown={dismiss}
		oncontextmenu={(e) => {
			e.preventDefault();
			close();
		}}
	></div>
	<div
		class="bg-surface-50-950 border-surface-300-700 fixed z-50 min-w-[11rem] overflow-hidden rounded border py-1 text-sm shadow-lg"
		style="left: {target.x}px; top: {target.y}px"
	>
		{#if !target.entry || target.entry.type === 'dir'}
			<button class={itemClass} onclick={runCommands((at) => onCreate?.(at.createDir, 'file'))}>
				<FilePlus class="text-surface-500 size-4" />
				{m.filetree_menu_new_file()}
			</button>
			<button class={itemClass} onclick={runCommands((at) => onCreate?.(at.createDir, 'dir'))}>
				<FolderPlus class="text-surface-500 size-4" />
				{m.filetree_menu_new_folder()}
			</button>
			<button
				class={itemClass}
				onclick={runCommands((at) => onCreate?.(at.createDir, 'include'))}
				use:tip={typstProject ? m.filetree_new_include_hint_typst() : m.filetree_new_include_hint()}
			>
				<FileSymlink class="text-surface-500 size-4" />
				{m.filetree_menu_new_include()}
			</button>
		{/if}
		{#if target.canSetMain}
			<button class={itemClass} onclick={runCommands((at) => at.entry && onSetMain?.(at.entry))}>
				<Star class="text-surface-500 size-4 {target.isMain ? 'fill-primary-500 text-primary-500' : ''}" />
				{target.isMain ? m.filetree_menu_unset_main() : m.filetree_menu_set_main()}
			</button>
		{/if}
		{#if target.entry}
			<button class={itemClass} onclick={runCommands(() => onCopy?.())}>
				<Copy class="text-surface-500 size-4" />
				{m.filetree_menu_copy()}
			</button>
		{/if}
		{#if target.canPaste}
			<button class={itemClass} onclick={runCommands((at) => onPaste?.(at.pasteDir))}>
				<ClipboardPaste class="text-surface-500 size-4" />
				{m.filetree_menu_paste()}
			</button>
		{/if}
		{#if target.canReveal}
			<button class={itemClass} onclick={runCommands((at) => at.entry && onReveal?.(at.entry))}>
				<FolderOpen class="text-surface-500 size-4" />
				{m.filetree_menu_reveal()}
			</button>
		{/if}
		{#if history && (history.canUndo || history.canRedo)}
			<!-- Something always precedes this group - right-clicking a file shows Copy, anywhere else
			     shows the New File block - so the LEADING rule is unconditional. -->
			<div class="border-surface-200-800 my-1 border-t"></div>
			{#if history.canUndo}
				<button class={itemClass} onclick={runCommands(() => void history?.undo())}>
					<Undo2 class="text-surface-500 size-4" />
					<span class="truncate">{m.filetree_menu_undo({ what: history.undoLabel ?? '' })}</span>
				</button>
			{/if}
			{#if history.canRedo}
				<button class={itemClass} onclick={runCommands(() => void history?.redo())}>
					<Redo2 class="text-surface-500 size-4" />
					<span class="truncate">{m.filetree_menu_redo({ what: history.redoLabel ?? '' })}</span>
				</button>
			{/if}
			<!-- ...but the TRAILING one only when Rename/Delete follow it. Right-clicking empty space
			     shows neither, and an unconditional rule then drew a stray line across the bottom of
			     the menu with nothing under it. Guarded rather than hidden with CSS, so the menu is
			     correct as markup instead of relying on a `last:` variant surviving the build. -->
			{#if target.entry}
				<div class="border-surface-200-800 my-1 border-t"></div>
			{/if}
		{/if}
		{#if target.entry}
			{#if target.selectionCount === 1}
				<button class={itemClass} onclick={runCommands((at) => at.entry && onRename?.(at.entry))}>
					<Pencil class="text-surface-500 size-4" />
					{m.filetree_rename()}
				</button>
			{/if}
			<button
				class="hover:preset-tonal-error text-error-600 flex w-full items-center gap-2.5 px-3 py-1.5 text-left"
				onclick={runCommands((at) => at.entry && onDelete?.(at.entry))}
			>
				<Trash2 class="size-4" />
				{target.selectionCount > 1 ? m.filetree_delete_many({ count: target.selectionCount }) : m.filetree_delete()}
			</button>
		{/if}
	</div>
{/if}
