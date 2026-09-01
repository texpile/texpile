<script lang="ts">
	import { FileSymlink } from '@lucide/svelte';
	import { untrack } from 'svelte';
	import FileIcon from './FileIcon.svelte';
	import FileTreeRow from './FileTreeRow.svelte';
	import FileTreeRightClickMenu, { type TreeTarget } from './FileTreeRightClickMenu.svelte';
	import { samePath, type TreeEntry } from '$lib/workspace/fileSystem';
	import type { FileHistory } from '$lib/workspace/fileHistory.svelte';
	import type { GitBadge } from '$lib/workspace/git';
	import { FileTreeState } from './treeState.svelte';
	import { FileTreeDnd, ROOT } from './treeDnd.svelte';
	import { TreeNameEditor } from './treeNameEditor.svelte';
	import { namePastedFiles, type ImportItem } from './treeImport';
	import { isInside } from './treePaths';
	import { focusSelect } from './focusSelect';
	import { m } from '$lib/paraglide/messages';
	import { confirmAsk } from '$lib/modals/confirm.svelte';
	import { toaster } from '$lib/modals/toaster-svelte';

	type Props = {
		tree: TreeEntry[];
		rootPath: string;
		activePath: string | null;
		/** Absolute path of the project's main entry .tex (badged in the tree), or null. */
		mainPath?: string | null;
		/** Per-file git status badges, keyed by gitKey(path). Empty when not a repo. */
		gitStatus?: Record<string, GitBadge>;
		onOpen: (entry: TreeEntry) => void;
		/** type 'include' creates a fragment (.tex or .typ per the compile target) AND inserts a
		 * reference for it at the cursor. */
		onCreate: (parentDir: string, name: string, type: 'file' | 'dir' | 'include') => void;
		/** the compile target is Typst: the New Include hint speaks #include, not \input */
		typstProject?: boolean;
		onRename: (entry: TreeEntry, newName: string) => void;
		/** several entries at once when a multi-selection is deleted/dragged. */
		onDelete: (entries: TreeEntry[]) => void;
		onMove: (entries: TreeEntry[], targetDir: string) => void;
		/** files dropped from the OS file manager or pasted from the clipboard. */
		onImport?: (items: ImportItem[], targetDir: string) => void;
		/** absolute paths dragged in from ANOTHER Texpile window; the drop copies them here. */
		onCopyIn?: (paths: string[], targetDir: string) => void;
		/** Set (or, if already main, clear) the project's main entry file. */
		onSetMain?: (entry: TreeEntry) => void;
		/** select the entry in the OS file manager. Omitted outside the desktop shell. */
		onReveal?: (entry: TreeEntry) => void;
		/** the tree's own undo/redo stack for FILE operations - never the editor's text history. */
		history?: FileHistory | null;
		/** allow adding new files by drop-from-OS / paste. */
		allowImport?: boolean;
	};
	let {
		tree,
		rootPath,
		activePath,
		mainPath = null,
		gitStatus = {},
		onOpen,
		onCreate,
		typstProject = false,
		onRename,
		onDelete,
		onMove,
		onImport,
		onCopyIn,
		onSetMain,
		onReveal,
		history = null,
		allowImport = true
	}: Props = $props();

	// samePath, not ===: a restored activePath can arrive mixed-separator on Windows and match no row
	function isActive(e: TreeEntry) {
		return !!activePath && samePath(activePath, e.path);
	}

	// .typ can be a main file too: the typst preview and PDF export both target mainFile ?? open file
	function isMainable(e: TreeEntry) {
		return e.type === 'file' && /\.(tex|typ)$/i.test(e.name);
	}
	function isMain(e: TreeEntry) {
		return !!mainPath && e.path.replace(/\\/g, '/').toLowerCase() === mainPath.replace(/\\/g, '/').toLowerCase();
	}

	const sel = new FileTreeState({ tree: () => tree, onOpen: (e) => onOpen(e) });
	const editor = new TreeNameEditor({
		rootPath: () => rootPath,
		expand: (dir) => (sel.expanded[dir] = true),
		onCreate: (dir, name, type) => onCreate(dir, name, type),
		onRename: (e, name) => onRename(e, name)
	});
	const dnd = new FileTreeDnd({
		rootPath: () => rootPath,
		selectedEntries: () => sel.selectedEntries(),
		ensureSelected: (e) => sel.ensureSelected(e),
		onMove: (entries, dir) => onMove(entries, dir),
		onImport: (items, dir) => onImport?.(items, dir),
		onCopyIn: (paths, dir) => onCopyIn?.(paths, dir)
	});

	// keep the selection only when it holds the file being opened; a row click selects and opens at once
	$effect(() => {
		const a = activePath;
		if (!a) return;
		untrack(() => {
			if (!sel.selected.some((p) => samePath(p, a))) sel.selected = [];
		});
	});

	function pasteTargetDir(): string {
		const s = sel.selectedEntries();
		return s.length === 1 && s[0].type === 'dir' ? s[0].path : rootPath;
	}

	function onPaste(e: ClipboardEvent) {
		if (!allowImport || !onImport) return;
		const el = e.target as HTMLElement | null;
		if (el?.closest('input, textarea, [contenteditable="true"], [contenteditable=""]')) return;
		const files = [...(e.clipboardData?.files ?? [])];
		if (!files.length) return;
		e.preventDefault();
		onImport(namePastedFiles(files), pasteTargetDir());
	}

	// our own path clipboard: a renderer cannot read file paths back out of the OS one, and putting
	// the bytes there would mean loading every selected file into memory to copy a folder
	let clipboard = $state<string[]>([]);
	const canPaste = $derived(clipboard.length > 0 && !!onCopyIn);

	function copySelection() {
		const paths = sel.selectedEntries().map((e) => e.path);
		if (!paths.length) return;
		clipboard = paths;
		toaster.success({
			title:
				paths.length === 1 ? m.filetree_toast_copied_one({ count: paths.length }) : m.filetree_toast_copied_other({ count: paths.length })
		});
	}

	function pasteClipboard(targetDir = pasteTargetDir()) {
		const safe = clipboard.filter((p) => targetDir !== p && !isInside(targetDir, p));
		if (safe.length) onCopyIn?.(safe, targetDir);
	}

	let treeEl = $state<HTMLElement | null>(null);
	// gates the shortcuts AND the active row's accent, from one source: Ctrl+Z must undo a file here
	// and a document edit in the editor, so the colour and the keystroke can never disagree
	let focused = $state(false);

	// dialogs hand focus back to their own trigger, which would leave the Ctrl+Z after a delete
	// landing on nothing
	function refocusTree() {
		return queueMicrotask(() => treeEl?.focus({ preventScroll: true }));
	}

	function onTreeKeydown(e: KeyboardEvent) {
		if (!focused || !(e.ctrlKey || e.metaKey) || e.altKey) return;
		const k = e.key.toLowerCase();
		if (k === 'c') {
			e.preventDefault();
			copySelection();
		} else if (k === 'v') {
			// let it through when we have nothing, so the paste EVENT still imports OS-clipboard files
			if (!canPaste) return;
			e.preventDefault();
			pasteClipboard();
		} else if (k === 'z' && !e.shiftKey) {
			e.preventDefault();
			void history?.undo();
		} else if (k === 'y' || (k === 'z' && e.shiftKey)) {
			e.preventDefault();
			void history?.redo();
		}
	}

	let rightClick: { open: (event: MouseEvent, at: TreeTarget) => void; close: () => void; isOpen: () => boolean } | undefined;
	function openCtx(e: MouseEvent, entry: TreeEntry | null) {
		// right-clicking outside the selection retargets it (the menu acts on what's selected)
		if (entry) sel.ensureSelected(entry);
		rightClick?.open(e, {
			entry,
			createDir: entry?.type === 'dir' ? entry.path : rootPath,
			pasteDir: entry?.type === 'dir' ? entry.path : pasteTargetDir(),
			selectionCount: entry ? deleteCount(entry) : 0,
			isMain: !!entry && isMain(entry),
			canSetMain: !!entry && deleteCount(entry) === 1 && isMainable(entry) && !!onSetMain,
			canPaste,
			canReveal: !!entry && !!onReveal && deleteCount(entry) === 1
		});
	}

	/** begins creating a file/folder/include at the workspace root; defaultName pre-fills the input. */
	export function newAtRoot(type: 'file' | 'dir' | 'include', defaultName = '') {
		editor.startCreate(rootPath, type, defaultName);
	}
	/** true while an inline name input is open, so callers don't rebuild the tree out from under it. */
	export function isEditing() {
		return editor.creatingIn !== null || editor.renaming !== null;
	}

	async function confirmDelete(e: TreeEntry) {
		// deleting a row inside a multi-selection deletes the whole selection
		if (sel.selected.includes(e.path) && sel.selectedEntries().length > 1) {
			const entries = sel.selectedEntries();
			if (
				await confirmAsk(m.filetree_confirm_delete_many({ count: entries.length }), { confirmLabel: m.filetree_delete(), danger: true })
			) {
				onDelete(entries);
				sel.selected = [];
			}
			refocusTree();
			return;
		}
		const message = e.type === 'dir' ? m.filetree_confirm_delete_dir({ name: e.name }) : m.filetree_confirm_delete_file({ name: e.name });
		if (await confirmAsk(message, { confirmLabel: m.filetree_delete(), danger: true })) onDelete([e]);
		refocusTree();
	}
	function deleteCount(e: TreeEntry) {
		return sel.selected.includes(e.path) ? sel.selectedEntries().length : 1;
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key !== 'Escape') {
			onTreeKeydown(e);
			return;
		}
		// escape hatch even if the inline input lost focus
		if (rightClick?.isOpen()) rightClick.close();
		else if (editor.creatingIn !== null) editor.cancelCreate();
		else if (editor.renaming !== null) editor.renaming = null;
		else if (sel.selected.length) sel.selected = [];
	}}
	onpaste={onPaste}
/>

{#snippet createInput(depth: number)}
	<div class="flex items-center gap-1 py-0.5" style="padding-left: {depth * 12 + 6}px">
		<!-- the icon previews what the row will become, so it tracks the name as it is typed -->
		{#if editor.createType === 'dir'}<FileIcon
				name=""
				folder="closed"
				class="size-4 shrink-0"
			/>{:else if editor.createType === 'include'}<FileSymlink class="text-surface-400 size-4 shrink-0" />{:else}<FileIcon
				name={editor.createValue}
				class="size-4 shrink-0"
			/>{/if}
		<input
			class="input h-6 flex-1 py-0 text-sm"
			placeholder={editor.createType === 'dir'
				? m.filetree_placeholder_folder_name()
				: editor.createType === 'include'
					? m.filetree_placeholder_include_name()
					: m.filetree_placeholder_file_name()}
			value={editor.createValue}
			oninput={(e) => {
				editor.createValue = e.currentTarget.value;
				editor.createEdited = true;
			}}
			use:focusSelect
			draggable="false"
			onpointerdown={(e) => e.stopPropagation()}
			onkeydown={(e) => {
				if (e.key === 'Enter') editor.commitCreate();
				else if (e.key === 'Escape') editor.cancelCreate();
			}}
			onblur={(e) => editor.blurCreate(e)}
		/>
	</div>
{/snippet}

<!-- empty space targets the workspace root. min-w-max: the box grows to the widest row so long names
     scroll sideways rather than being trimmed, and every row's hover/selection fill still spans the
     full scrollable width -->
<div
	bind:this={treeEl}
	role="presentation"
	tabindex="-1"
	class="min-h-full min-w-max rounded outline-none {dnd.dropTarget === ROOT ? 'ring-primary-500 ring-2 ring-inset' : ''}"
	onfocusin={() => (focused = true)}
	onfocusout={(e) => {
		// relatedTarget is where focus is HEADING; moving between two rows must not read as leaving
		if (!treeEl?.contains(e.relatedTarget as Node | null)) focused = false;
	}}
	ondragover={(e) => dnd.onRootDragOver(e)}
	ondragleave={(e) => dnd.onTreeDragLeave(e)}
	ondrop={(e) => dnd.onRootDrop(e)}
	onclick={(e) => {
		if (e.target === e.currentTarget) sel.selected = [];
	}}
	oncontextmenu={(e) => openCtx(e, null)}
>
	{#if editor.creatingIn === rootPath}{@render createInput(0)}{/if}
	{#each tree as entry (entry.path)}
		<FileTreeRow {entry} depth={0} {sel} {dnd} {editor} {focused} {gitStatus} {isActive} {isMain} {onOpen} {openCtx} {createInput} />
	{/each}
</div>

<FileTreeRightClickMenu
	bind:this={rightClick}
	{history}
	{typstProject}
	{onSetMain}
	{onReveal}
	onCreate={(dir, type) => editor.startCreate(dir, type)}
	onCopy={copySelection}
	onPaste={pasteClipboard}
	onRename={(e) => editor.startRename(e)}
	onDelete={confirmDelete}
	onClose={refocusTree}
/>
