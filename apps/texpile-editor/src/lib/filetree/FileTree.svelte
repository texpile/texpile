<script lang="ts">
	import { FileSymlink } from '@lucide/svelte';
	import { tick, untrack } from 'svelte';
	import FileIcon from './FileIcon.svelte';
	import FileTreeRow from './FileTreeRow.svelte';
	import { openFileTreeContextMenu, type TreeTarget } from './fileTreeContextMenu';
	import { contextMenuOpen, closeContextMenu } from '$lib/menus/contextMenu.svelte';
	import { samePath, type TreeEntry } from '$lib/workspace/fileSystem';
	import type { FileHistory } from '$lib/workspace/fileHistory.svelte';
	import type { GitBadge } from '$lib/workspace/scm/git';
	import { FileTreeState } from './treeState.svelte';
	import { treeRevealRequest } from './treeReveal.svelte';
	import { FileTreeDnd, ROOT } from './treeDnd.svelte';
	import { TreeNameEditor } from './treeNameEditor.svelte';
	import { namePastedFiles, type ImportItem } from './treeImport';
	import { isInside, nameTaken, includeFileName } from './treePaths';
	import { focusSelect } from './focusSelect';
	import { tip } from '$lib/components/tooltip.svelte';
	import { m } from '$lib/paraglide/messages';
	import { confirmAsk } from '$lib/modals/confirm.svelte';
	import { toaster } from '$lib/modals/toaster-svelte';
	import { openLocalHistory, openRestoreDeleted } from '$lib/workspace/localHistory/localHistoryDialog.svelte';

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
		/** a file's Local History and a folder's deleted files: off for a guest, whose files are the host's */
		localHistory?: boolean;
		/** the tree's own undo/redo stack for FILE operations - never the editor's text history. */
		history?: FileHistory | null;
		/** allow adding new files by drop-from-OS / paste. */
		allowImport?: boolean;
		/** does this path (or anything inside it) hold edits that exist only in the editor? */
		hasUnsaved?: (path: string) => boolean;
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
		localHistory = false,
		history = null,
		allowImport = true,
		hasUnsaved
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
		onRename: (e, name) => onRename(e, name),
		nameTaken: (dir, name, selfPath) => nameTaken(tree, dir, rootPath, name, selfPath),
		takenMessage: (name) => m.filetree_name_exists({ name }),
		includeName: (name) => includeFileName(name, typstProject)
	});
	const dnd = new FileTreeDnd({
		rootPath: () => rootPath,
		selectedEntries: () => sel.selectedEntries(),
		ensureSelected: (e) => sel.ensureSelected(e),
		onMove: (entries, dir) => onMove(entries, dir),
		onImport: (items, dir) => onImport?.(items, dir),
		onCopyIn: (paths, dir) => onCopyIn?.(paths, dir)
	});

	// keep the selection only when it holds the file being opened; a row click selects and opens at once.
	// the folders above it open once per file (the tree can arrive after the path on a restore), so a
	// folder the user closes afterwards stays closed
	let revealed: string | null = null;
	$effect(() => {
		const a = activePath;
		void tree;
		if (!a) return;
		untrack(() => {
			if (!sel.selected.some((p) => samePath(p, a))) sel.selected = [];
			if (revealed !== a && sel.reveal(a)) revealed = a;
		});
	});

	// a request can land before a fresh tree holds the file
	$effect(() => {
		const req = treeRevealRequest.current;
		void tree;
		if (!req) return;
		untrack(() => {
			if (!sel.reveal(req.path)) return;
			sel.selected = [req.path];
			treeRevealRequest.current = null;
			void tick().then(() => treeEl?.querySelector(`[data-path="${CSS.escape(req.path)}"]`)?.scrollIntoView({ block: 'nearest' }));
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

	function openCtx(e: MouseEvent, entry: TreeEntry | null) {
		// right-clicking outside the selection retargets it (the menu acts on what's selected)
		if (entry) sel.ensureSelected(entry);
		const at: TreeTarget = {
			entry,
			createDir: entry?.type === 'dir' ? entry.path : rootPath,
			pasteDir: entry?.type === 'dir' ? entry.path : pasteTargetDir(),
			selectionCount: entry ? deleteCount(entry) : 0,
			isMain: !!entry && isMain(entry),
			canSetMain: !!entry && deleteCount(entry) === 1 && isMainable(entry) && !!onSetMain,
			canPaste,
			canReveal: !!entry && !!onReveal && deleteCount(entry) === 1
		};
		openFileTreeContextMenu(e, at, {
			history,
			typstProject,
			onSetMain,
			onReveal,
			onLocalHistory: localHistory ? (e) => openLocalHistory(e.path) : undefined,
			onRestoreDeleted: localHistory ? (dir) => openRestoreDeleted(dir) : undefined,
			onCreate: (dir, type) => editor.startCreate(dir, type),
			onCopy: copySelection,
			onPaste: pasteClipboard,
			onRename: (entry) => editor.startRename(entry),
			onDelete: confirmDelete,
			onClose: refocusTree
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

	// deleting a row inside a multi-selection deletes the whole selection
	function deleteTargets(e: TreeEntry): TreeEntry[] {
		return sel.selected.includes(e.path) && sel.selectedEntries().length > 1 ? sel.selectedEntries() : [e];
	}

	/**
	 * What to ask before deleting. Unsaved edits outrank the ordinary question: the recycle bin
	 * holds the file as it was on disk, so the part that is really being destroyed is the part
	 * that was never written. Asking about that IS the confirmation; a second "delete?" after it
	 * says nothing new.
	 */
	function deleteQuestion(entries: TreeEntry[]): string {
		// the count always describes what is being deleted, never how many of them are dirty: a
		// selection of five with one unsaved is still five files going
		const dirty = entries.some((x) => hasUnsaved?.(x.path));
		if (entries.length > 1)
			return dirty
				? m.filetree_confirm_delete_dirty_many({ count: entries.length })
				: m.filetree_confirm_delete_many({ count: entries.length });
		const e = entries[0];
		if (dirty) return m.filetree_confirm_delete_dirty_one({ name: e.name });
		return e.type === 'dir' ? m.filetree_confirm_delete_dir({ name: e.name }) : m.filetree_confirm_delete_file({ name: e.name });
	}

	async function confirmDelete(e: TreeEntry) {
		const entries = deleteTargets(e);
		if (await confirmAsk(deleteQuestion(entries), { confirmLabel: m.filetree_delete(), danger: true })) {
			onDelete(entries);
			if (entries.length > 1) sel.selected = [];
		}
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
		if (contextMenuOpen()) closeContextMenu();
		else if (editor.creatingIn !== null) editor.cancelCreate();
		else if (editor.renaming !== null) editor.renaming = null;
		else if (sel.selected.length) sel.selected = [];
	}}
	onpaste={onPaste}
/>

{#snippet createInput(depth: number)}
	<div class="flex flex-col" style="padding-left: {depth * 12 + 6}px">
		<div class="flex items-center gap-1 py-0.5">
			<!-- the icon previews what the row will become, so it tracks the name as it is typed -->
			{#if editor.createType === 'dir'}<FileIcon
					name=""
					folder="closed"
					class="size-4 shrink-0"
				/>{:else if editor.createType === 'include'}<FileSymlink class="text-faint size-4 shrink-0" />{:else}<FileIcon
					name={editor.createValue}
					class="size-4 shrink-0"
				/>{/if}
			<!-- size=1: an input is ~20 characters wide by default, and the tree's min-w-max would adopt
		     that as the row width, pushing the explorer wider than its column -->
			<input
				class="input h-6 min-w-0 flex-1 py-0 text-sm {editor.createError ? 'border-error-500 text-error-ink' : ''}"
				size={1}
				aria-invalid={!!editor.createError}
				use:tip={editor.createError ?? undefined}
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
		<!-- spelled out under the field, not only in the hover hint: Enter on a taken name refuses
		     silently, and a red border alone does not say why -->
		{#if editor.createError}
			<span class="text-error-ink max-w-56 pb-1 pl-5 text-[11px] leading-tight">{editor.createError}</span>
		{/if}
	</div>
{/snippet}

<!-- empty space targets the workspace root. min-w-max: the box grows to the widest row so long names
     scroll sideways rather than being trimmed, and every row's hover/selection fill still spans the
     full scrollable width -->
<div
	bind:this={treeEl}
	role="presentation"
	tabindex="-1"
	class="rounded-container min-h-full min-w-max outline-none {dnd.dropTarget === ROOT ? 'ring-primary-500 ring-2 ring-inset' : ''}"
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
