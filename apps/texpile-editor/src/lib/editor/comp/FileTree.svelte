<script lang="ts">
	import {
		ChevronRight,
		ChevronDown,
		Folder,
		FileText,
		File,
		FilePlus,
		FolderPlus,
		Pencil,
		Trash2,
		Star,
		FileSymlink
	} from '@lucide/svelte';
	import type { TreeEntry } from '$lib/workspace/fileSystem';
	import { gitKey } from '$lib/workspace/gitStore';
	import type { GitBadge } from '$lib/workspace/git';
	import { m } from '$lib/paraglide/messages';

	interface Props {
		tree: TreeEntry[];
		rootPath: string;
		activePath: string | null;
		/** Absolute path of the project's main entry .tex (badged in the tree), or null. */
		mainPath?: string | null;
		/** Per-file git status badges, keyed by gitKey(path). Empty when not a repo. */
		gitStatus?: Record<string, GitBadge>;
		onOpen: (entry: TreeEntry) => void;
		/** type 'include' creates a .tex fragment AND inserts an \input for it at the cursor. */
		onCreate: (parentDir: string, name: string, type: 'file' | 'dir' | 'include') => void;
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
		/** guest session: browse + open only, no rename/delete/internal-move. */
		readOnly?: boolean;
		/** allow adding new files by drop-from-OS / paste (true even for a read-only guest). */
		allowImport?: boolean;
	}
	let {
		tree,
		rootPath,
		activePath,
		mainPath = null,
		gitStatus = {},
		onOpen,
		onCreate,
		onRename,
		onDelete,
		onMove,
		onImport,
		onCopyIn,
		onSetMain,
		readOnly = false,
		allowImport = true
	}: Props = $props();

	interface ImportItem {
		/** destination path relative to the drop/paste target dir (forward slashes). */
		relPath: string;
		file: globalThis.File;
	}

	const isTex = (e: TreeEntry) => e.type === 'file' && e.name.toLowerCase().endsWith('.tex');
	const isMain = (e: TreeEntry) => !!mainPath && e.path.replace(/\\/g, '/').toLowerCase() === mainPath.replace(/\\/g, '/').toLowerCase();

	// Git status badge (VS Code convention: a single colored letter). Only files carry one.
	const gitBadge = (e: TreeEntry): GitBadge | undefined => (e.type === 'file' ? gitStatus[gitKey(e.path)] : undefined);
	const BADGE_COLOR: Record<GitBadge, string> = {
		M: 'text-amber-500',
		A: 'text-green-500',
		D: 'text-red-500',
		U: 'text-sky-500',
		R: 'text-violet-500'
	};
	const BADGE_TITLE: Record<GitBadge, string> = {
		M: m.filetree_badge_modified(),
		A: m.filetree_badge_added(),
		D: m.filetree_badge_deleted(),
		U: m.filetree_badge_untracked(),
		R: m.filetree_badge_renamed()
	};

	let expanded = $state<Record<string, boolean>>({});
	let renaming = $state<string | null>(null);
	let renameValue = $state('');
	let renameEdited = $state(false);
	let creatingIn = $state<string | null>(null);
	let createType = $state<'file' | 'dir' | 'include'>('file');
	let createValue = $state('');
	let createEdited = $state(false); // did the user actually type, or is this still our pre-fill?

	// ---- selection (ctrl/cmd toggles, shift ranges over the visible order) ----
	let selected = $state<string[]>([]);
	let anchorPath: string | null = null; // shift-range pivot; the last plain/ctrl-clicked row

	/** the tree in on-screen order, honouring which folders are expanded (shift-range domain). */
	function flattenVisible(entries: TreeEntry[] = tree, out: TreeEntry[] = []): TreeEntry[] {
		for (const e of entries) {
			out.push(e);
			if (e.type === 'dir' && expanded[e.path]) flattenVisible(e.children ?? [], out);
		}
		return out;
	}
	function findEntry(path: string, entries: TreeEntry[] = tree): TreeEntry | null {
		for (const e of entries) {
			if (e.path === path) return e;
			if (e.type === 'dir') {
				const hit = findEntry(path, e.children ?? []);
				if (hit) return hit;
			}
		}
		return null;
	}
	/** the selected entries with nested ones pruned: moving/deleting a folder covers its children,
	 *  and handling a child separately after its parent moved would act on a dead path. */
	function selectedEntries(): TreeEntry[] {
		const paths = selected.filter((p) => !selected.some((other) => other !== p && isInside(p, other)));
		return paths.map((p) => findEntry(p)).filter((e): e is TreeEntry => !!e);
	}
	function handleRowClick(e: MouseEvent, entry: TreeEntry) {
		if (e.ctrlKey || e.metaKey) {
			selected = selected.includes(entry.path) ? selected.filter((p) => p !== entry.path) : [...selected, entry.path];
			anchorPath = entry.path;
			return;
		}
		if (e.shiftKey && anchorPath) {
			const order = flattenVisible().map((x) => x.path);
			const a = order.indexOf(anchorPath);
			const b = order.indexOf(entry.path);
			if (a >= 0 && b >= 0) {
				selected = order.slice(Math.min(a, b), Math.max(a, b) + 1);
				return;
			}
		}
		selected = [entry.path];
		anchorPath = entry.path;
		if (entry.type === 'dir') expanded[entry.path] = !expanded[entry.path];
		else onOpen(entry);
	}

	// ---- drag & drop: internal moves and OS-file imports ----
	let dragging = $state<TreeEntry | null>(null);
	let dragPaths = $state<string[]>([]); // everything the drag carries (the multi-selection)
	let dropTarget = $state<string | null>(null); // the DIRECTORY that would receive the drop, or ROOT
	const ROOT = '__root__';

	const sepOf = (p: string) => (p.includes('\\') ? '\\' : '/');
	const parentOf = (p: string) => {
		const i = p.lastIndexOf(sepOf(p));
		return i >= 0 ? p.slice(0, i) : p;
	};
	// dropping on a folder targets it; dropping on a file targets its parent folder
	const dropDir = (entry: TreeEntry) => (entry.type === 'dir' ? entry.path : parentOf(entry.path));
	const isInside = (path: string, ancestor: string) => path.startsWith(ancestor + sepOf(ancestor));
	// a target is valid when no dragged item IS it or contains it
	const canDropAll = (target: string) => dragPaths.length > 0 && dragPaths.every((p) => target !== p && !isInside(target, p));
	/** a drag that comes from outside the app (OS file manager) rather than a tree row. */
	const isExternalDrag = (e: DragEvent) => !dragging && !!e.dataTransfer?.types?.includes('Files');
	// A tree drag from ANOTHER Texpile window: our own `dragging` is null, but the payload
	// carries this MIME tag. Only the TYPE is readable during dragover (drag data is sealed
	// until drop, by spec), which is exactly why the tag exists: it identifies the drag
	// without seeing the data, and plain editor text drags don't false-positive.
	const PATHS_MIME = 'application/x-texpile-paths';
	const isCrossWindowDrag = (e: DragEvent) => !dragging && !!e.dataTransfer?.types?.includes(PATHS_MIME);
	// ring the row of the receiving DIRECTORY (not whatever row the pointer is on)
	const markTarget = (dir: string) => {
		dropTarget = dir === rootPath ? ROOT : dir;
	};

	function onRowDragStart(e: DragEvent, entry: TreeEntry) {
		if (readOnly) {
			e.preventDefault(); // guests can't rearrange the host's files
			return;
		}
		// dragging an unselected row abandons the selection and drags just that row
		if (!selected.includes(entry.path)) {
			selected = [entry.path];
			anchorPath = entry.path;
		}
		dragging = entry;
		dragPaths = selectedEntries().map((x) => x.path);
		if (e.dataTransfer) {
			// move within this window; a drop in another window's tree copies instead
			e.dataTransfer.effectAllowed = 'copyMove';
			e.dataTransfer.setData('text/plain', dragPaths.join('\n'));
			e.dataTransfer.setData(PATHS_MIME, JSON.stringify(dragPaths));
		}
	}
	function onRowDragOver(e: DragEvent, entry: TreeEntry) {
		const dir = dropDir(entry);
		if (isExternalDrag(e) || isCrossWindowDrag(e)) {
			e.preventDefault();
			e.stopPropagation();
			if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
			markTarget(dir);
			return;
		}
		if (!canDropAll(dir)) return;
		e.preventDefault();
		e.stopPropagation(); // the container's handler would re-target the drop to ROOT
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		markTarget(dir);
	}
	function onRowDrop(e: DragEvent, entry: TreeEntry) {
		e.preventDefault();
		e.stopPropagation();
		finishDrop(e, dropDir(entry));
	}
	function onRootDragOver(e: DragEvent) {
		if (isExternalDrag(e) || isCrossWindowDrag(e)) {
			e.preventDefault();
			if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
			dropTarget = ROOT;
			return;
		}
		if (!canDropAll(rootPath)) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		dropTarget = ROOT;
	}
	function onRootDrop(e: DragEvent) {
		e.preventDefault();
		finishDrop(e, rootPath);
	}
	function finishDrop(e: DragEvent, targetDir: string) {
		const external = isExternalDrag(e);
		const crossWindow = isCrossWindowDrag(e);
		// read-only (guest) can still ADD files by dropping from outside; it just can't move its own
		if (readOnly && !(external && allowImport)) return;
		const entries = dragging ? selectedEntries() : [];
		const valid = canDropAll(targetDir);
		dragging = null;
		dragPaths = [];
		dropTarget = null;
		if (crossWindow) {
			// a tree drag from another Texpile window: the data is readable now (drop), and
			// the drop COPIES so the source window's workspace is never mutated behind its back
			let paths: string[] = [];
			try {
				paths = JSON.parse(e.dataTransfer?.getData(PATHS_MIME) || '[]');
			} catch {
				/* malformed payload: ignore the drop */
			}
			const safe = paths.filter((p) => typeof p === 'string' && p && targetDir !== p && !isInside(targetDir, p));
			if (safe.length) onCopyIn?.(safe, targetDir);
		} else if (external) {
			void collectDropItems(e).then((items) => {
				if (items.length) onImport?.(items, targetDir);
			});
		} else if (entries.length && valid) {
			onMove(entries, targetDir);
		}
	}
	// clearing on the container, not per row: leaving one row for the next fires a dragleave
	// that would blank the ring mid-drag; only a true exit of the panel clears it
	function onTreeDragLeave(e: DragEvent) {
		const to = e.relatedTarget as Node | null;
		if (!to || !(e.currentTarget as HTMLElement).contains(to)) dropTarget = null;
	}
	function onDragEnd() {
		dragging = null;
		dragPaths = [];
		dropTarget = null;
	}

	// ---- OS-file imports (drop from the system file manager, or clipboard paste) ----
	// walks dropped directories via the webkitGetAsEntry tree so folder drops import their
	// contents; reads file BYTES (no OS paths involved), which also works for clipboard files
	async function collectDropItems(e: DragEvent): Promise<ImportItem[]> {
		const out: ImportItem[] = [];
		const items = [...(e.dataTransfer?.items ?? [])];
		const entries = items.map((i) => i.webkitGetAsEntry?.()).filter((x): x is FileSystemEntry => !!x);
		if (!entries.length) {
			for (const f of e.dataTransfer?.files ?? []) out.push({ relPath: f.name, file: f });
			return out;
		}
		const readAll = (dir: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> =>
			new Promise((resolve) => {
				const reader = dir.createReader();
				const acc: FileSystemEntry[] = [];
				const step = () =>
					reader.readEntries(
						(batch) => {
							if (!batch.length) return resolve(acc);
							acc.push(...batch);
							step(); // readEntries returns at most ~100 per call
						},
						() => resolve(acc)
					);
				step();
			});
		const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
			if (entry.isFile) {
				const f = await new Promise<globalThis.File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject)).catch(
					() => null
				);
				if (f) out.push({ relPath: prefix + entry.name, file: f });
			} else if (entry.isDirectory) {
				for (const child of await readAll(entry as FileSystemDirectoryEntry)) await walk(child, prefix + entry.name + '/');
			}
		};
		for (const entry of entries) await walk(entry, '');
		return out;
	}

	// Ctrl+V while the editor doesn't own focus: save clipboard files/images into the tree.
	// A pasted screenshot arrives as a nameless "image.png"; give it a recognizable name.
	function onPaste(e: ClipboardEvent) {
		if (!allowImport || !onImport) return;
		const el = e.target as HTMLElement | null;
		if (el?.closest('input, textarea, [contenteditable="true"], [contenteditable=""]')) return;
		const files = [...(e.clipboardData?.files ?? [])];
		if (!files.length) return;
		e.preventDefault();
		const items = files.map((f, i) => {
			let name = f.name || 'pasted-image.png';
			if (/^image\.(png|jpe?g|gif|webp)$/i.test(name)) name = name.replace(/^image/i, 'pasted-image');
			if (files.length > 1 && files.every((x) => x.name === files[0].name)) name = name.replace(/(\.[^.]+)$/, `-${i + 1}$1`);
			return { relPath: name, file: f };
		});
		// paste lands in the single selected folder, else the workspace root
		const sel = selectedEntries();
		const target = sel.length === 1 && sel[0].type === 'dir' ? sel[0].path : rootPath;
		onImport(items, target);
	}

	let ctxMenu = $state<{ x: number; y: number; entry: TreeEntry | null } | null>(null);
	function openCtx(e: MouseEvent, entry: TreeEntry | null) {
		if (readOnly) return; // guests browse only: no rename/delete/new-file context menu
		e.preventDefault();
		e.stopPropagation();
		// right-clicking outside the selection retargets it (the menu acts on what's selected)
		if (entry && !selected.includes(entry.path)) {
			selected = [entry.path];
			anchorPath = entry.path;
		}
		// keep the menu on-screen near the bottom/right edges
		const x = Math.min(e.clientX, window.innerWidth - 184);
		const y = Math.min(e.clientY, window.innerHeight - 168);
		ctxMenu = { x, y, entry };
	}
	const ctxTargetDir = () => (ctxMenu?.entry?.type === 'dir' ? ctxMenu.entry.path : rootPath);

	// focus on mount and select the base name (keep the extension, like VSCode).
	function focusSelect(node: HTMLInputElement) {
		const grab = () => {
			node.focus();
			const dot = node.value.lastIndexOf('.');
			if (dot > 0) node.setSelectionRange(0, dot);
			else node.select();
		};
		grab();
		// Skeleton's menu (Zag) refocuses its trigger in a queueMicrotask as it closes, which lands
		// just after we mount and takes the field away before the user can type. Grab it back once,
		// on the next frame, only if something actually took it. Deliberately NOT a re-assert loop:
		// that was tried, and it made the field impossible to leave.
		requestAnimationFrame(() => {
			if (node.isConnected && document.activeElement !== node) grab();
		});
	}

	function startCreate(dir: string, type: 'file' | 'dir' | 'include', defaultName = '') {
		creatingIn = dir;
		createType = type;
		createValue = defaultName;
		createEdited = false;
		if (dir !== rootPath) expanded[dir] = true;
	}
	/** begins creating a file/folder/include at the workspace root; defaultName pre-fills the input. */
	export function newAtRoot(type: 'file' | 'dir' | 'include', defaultName = '') {
		startCreate(rootPath, type, defaultName);
	}
	/** true while an inline name input is open, so callers don't rebuild the tree out from under it. */
	export function isEditing() {
		return creatingIn !== null || renaming !== null;
	}
	function commitCreate() {
		const v = createValue.trim();
		const dir = creatingIn;
		creatingIn = null;
		createValue = '';
		if (v && dir) onCreate(dir, v, createType);
	}
	// Blur is not consent. A menu closing hands focus back to its trigger a tick after we mount
	// (Skeleton/Zag does this), so an untouched field going blurry means the naming step never
	// started, not that the user accepted our pre-filled name. Leave it open for them instead.
	function blurCreate() {
		if (createEdited) commitCreate();
	}
	function cancelCreate() {
		creatingIn = null;
		createValue = '';
	}
	function startRename(e: TreeEntry) {
		renaming = e.path;
		renameValue = e.name;
		renameEdited = false;
	}
	function commitRename(e: TreeEntry) {
		if (renaming !== e.path) return; // guard against Enter + blur double-firing
		renaming = null;
		const v = renameValue.trim();
		if (v && v !== e.name) onRename(e, v);
	}
	/** same reasoning as blurCreate: an untouched field losing focus is not the user committing. */
	function blurRename(e: TreeEntry) {
		if (renameEdited) commitRename(e);
	}
	function confirmDelete(e: TreeEntry) {
		// deleting a row that's part of a multi-selection deletes the whole selection
		if (selected.includes(e.path) && selectedEntries().length > 1) {
			const entries = selectedEntries();
			if (confirm(m.filetree_confirm_delete_many({ count: entries.length }))) {
				onDelete(entries);
				selected = [];
			}
			return;
		}
		const message = e.type === 'dir' ? m.filetree_confirm_delete_dir({ name: e.name }) : m.filetree_confirm_delete_file({ name: e.name });
		if (confirm(message)) onDelete([e]);
	}
	/** how many rows a delete from this entry would remove (for the context-menu label). */
	const deleteCount = (e: TreeEntry) => (selected.includes(e.path) ? selectedEntries().length : 1);
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key !== 'Escape') return;
		// escape hatch even if the inline input lost focus
		if (ctxMenu) ctxMenu = null;
		else if (creatingIn !== null) cancelCreate();
		else if (renaming !== null) renaming = null;
		else if (selected.length) selected = [];
	}}
	onpaste={onPaste}
/>

{#snippet createInput(depth: number)}
	<div class="flex items-center gap-1 py-0.5" style="padding-left: {depth * 12 + 6}px">
		{#if createType === 'dir'}<Folder class="text-surface-400 size-4 shrink-0" />{:else if createType === 'include'}<FileSymlink
				class="text-surface-400 size-4 shrink-0"
			/>{:else}<File class="text-surface-400 size-4 shrink-0" />{/if}
		<input
			class="input h-6 flex-1 py-0 text-sm"
			placeholder={createType === 'dir'
				? m.filetree_placeholder_folder_name()
				: createType === 'include'
					? m.filetree_placeholder_include_name()
					: m.filetree_placeholder_file_name()}
			value={createValue}
			oninput={(e) => {
				createValue = e.currentTarget.value;
				createEdited = true;
			}}
			use:focusSelect
			draggable="false"
			onpointerdown={(e) => e.stopPropagation()}
			onkeydown={(e) => {
				if (e.key === 'Enter') commitCreate();
				else if (e.key === 'Escape') cancelCreate();
			}}
			onblur={blurCreate}
		/>
	</div>
{/snippet}

{#snippet row(entry: TreeEntry, depth: number)}
	<div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="group flex items-center rounded text-sm transition-colors {activePath === entry.path
				? 'bg-primary-500/15 text-primary-700 dark:text-primary-300 font-medium'
				: selected.includes(entry.path)
					? 'bg-surface-300-700/60'
					: 'hover:bg-surface-200-800'} {dropTarget === entry.path && entry.type === 'dir'
				? 'ring-primary-500 ring-2 ring-inset'
				: ''} {dragPaths.includes(entry.path) ? 'opacity-50' : ''}"
			draggable={renaming !== entry.path}
			ondragstart={(e) => onRowDragStart(e, entry)}
			ondragover={(e) => onRowDragOver(e, entry)}
			ondrop={(e) => onRowDrop(e, entry)}
			ondragend={onDragEnd}
			oncontextmenu={(e) => openCtx(e, entry)}
		>
			<button
				class="flex min-w-0 flex-1 items-center gap-1 py-0.5"
				style="padding-left: {depth * 12 + 4}px"
				onclick={(e) => handleRowClick(e, entry)}
				ondblclick={() => entry.type === 'file' && onOpen(entry)}
			>
				{#if entry.type === 'dir'}
					{#if expanded[entry.path]}<ChevronDown class="text-surface-400 size-3.5 shrink-0" />{:else}<ChevronRight
							class="text-surface-400 size-3.5 shrink-0"
						/>{/if}
					<Folder class="text-surface-400 size-4 shrink-0" />
				{:else}
					<span class="w-3.5 shrink-0"></span>
					<FileText class="text-surface-400 size-4 shrink-0" />
				{/if}
				{#if renaming === entry.path}
					<input
						class="input h-6 min-w-0 flex-1 py-0 text-sm"
						value={renameValue}
						oninput={(e) => {
							renameValue = e.currentTarget.value;
							renameEdited = true;
						}}
						use:focusSelect
						draggable="false"
						onpointerdown={(e) => e.stopPropagation()}
						onclick={(e) => e.stopPropagation()}
						onkeydown={(e) => {
							if (e.key === 'Enter') commitRename(entry);
							else if (e.key === 'Escape') renaming = null;
						}}
						onblur={() => blurRename(entry)}
					/>
				{:else}
					<span class="truncate">{entry.name}</span>
					{#if isMain(entry)}
						<Star class="fill-primary-500 text-primary-500 size-3 shrink-0" aria-label={m.filetree_main_file_label()} />
					{/if}
					{#if gitBadge(entry)}
						{@const b = gitBadge(entry)}
						<span class="ml-auto shrink-0 pr-1 font-mono text-xs font-bold {b ? BADGE_COLOR[b] : ''}" title={b ? BADGE_TITLE[b] : ''}
							>{b}</span
						>
					{/if}
				{/if}
			</button>
			{#if renaming !== entry.path}
				<div class="flex shrink-0 items-center gap-0.5 pr-1 opacity-0 group-hover:opacity-100">
					{#if entry.type === 'dir'}
						<button
							class="btn-icon btn-icon-sm hover:preset-tonal"
							title={m.filetree_new_file_title()}
							onclick={() => startCreate(entry.path, 'file')}
						>
							<FilePlus class="size-3.5" />
						</button>
					{/if}
					<button class="btn-icon btn-icon-sm hover:preset-tonal" title={m.filetree_rename()} onclick={() => startRename(entry)}>
						<Pencil class="size-3.5" />
					</button>
					<button class="btn-icon btn-icon-sm hover:preset-tonal-error" title={m.filetree_delete()} onclick={() => confirmDelete(entry)}>
						<Trash2 class="size-3.5" />
					</button>
				</div>
			{/if}
		</div>

		{#if entry.type === 'dir' && expanded[entry.path]}
			{#if creatingIn === entry.path}{@render createInput(depth + 1)}{/if}
			{#each entry.children ?? [] as child (child.path)}
				{@render row(child, depth + 1)}
			{/each}
		{/if}
	</div>
{/snippet}

<!-- empty-space drops and right-clicks target the workspace root; clicking empty space clears
     the selection (Escape is the keyboard path for that, see the window handler above) -->
<div
	role="presentation"
	class="min-h-full rounded {dropTarget === ROOT ? 'ring-primary-500 ring-2 ring-inset' : ''}"
	ondragover={onRootDragOver}
	ondragleave={onTreeDragLeave}
	ondrop={onRootDrop}
	onclick={(e) => {
		if (e.target === e.currentTarget) selected = [];
	}}
	oncontextmenu={(e) => openCtx(e, null)}
>
	{#if creatingIn === rootPath}{@render createInput(0)}{/if}
	{#each tree as entry (entry.path)}
		{@render row(entry, 0)}
	{/each}
</div>

{#if ctxMenu}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50"
		onpointerdown={() => (ctxMenu = null)}
		oncontextmenu={(e) => {
			e.preventDefault();
			ctxMenu = null;
		}}
	></div>
	<div
		class="bg-surface-50-950 border-surface-300-700 fixed z-50 min-w-[11rem] overflow-hidden rounded border py-1 text-sm shadow-lg"
		style="left: {ctxMenu.x}px; top: {ctxMenu.y}px"
	>
		{#if !ctxMenu.entry || ctxMenu.entry.type === 'dir'}
			<button
				class="hover:preset-tonal-primary flex w-full items-center gap-2.5 px-3 py-1.5 text-left"
				onclick={() => {
					const d = ctxTargetDir();
					ctxMenu = null;
					startCreate(d, 'file');
				}}
			>
				<FilePlus class="text-surface-500 size-4" />
				{m.filetree_menu_new_file()}
			</button>
			<button
				class="hover:preset-tonal-primary flex w-full items-center gap-2.5 px-3 py-1.5 text-left"
				onclick={() => {
					const d = ctxTargetDir();
					ctxMenu = null;
					startCreate(d, 'dir');
				}}
			>
				<FolderPlus class="text-surface-500 size-4" />
				{m.filetree_menu_new_folder()}
			</button>
			<button
				class="hover:preset-tonal-primary flex w-full items-center gap-2.5 px-3 py-1.5 text-left"
				onclick={() => {
					const d = ctxTargetDir();
					ctxMenu = null;
					startCreate(d, 'include');
				}}
				title={m.filetree_new_include_hint()}
			>
				<FileSymlink class="text-surface-500 size-4" />
				{m.filetree_menu_new_include()}
			</button>
		{/if}
		{#if ctxMenu.entry && deleteCount(ctxMenu.entry) === 1 && isTex(ctxMenu.entry) && onSetMain}
			<button
				class="hover:preset-tonal-primary flex w-full items-center gap-2.5 px-3 py-1.5 text-left"
				onclick={() => {
					const e = ctxMenu.entry;
					ctxMenu = null;
					if (e) onSetMain?.(e);
				}}
			>
				<Star class="text-surface-500 size-4 {ctxMenu.entry && isMain(ctxMenu.entry) ? 'fill-primary-500 text-primary-500' : ''}" />
				{ctxMenu.entry && isMain(ctxMenu.entry) ? m.filetree_menu_unset_main() : m.filetree_menu_set_main()}
			</button>
		{/if}
		{#if ctxMenu.entry}
			{#if deleteCount(ctxMenu.entry) === 1}
				<button
					class="hover:preset-tonal-primary flex w-full items-center gap-2.5 px-3 py-1.5 text-left"
					onclick={() => {
						const e = ctxMenu.entry;
						ctxMenu = null;
						if (e) startRename(e);
					}}
				>
					<Pencil class="text-surface-500 size-4" />
					{m.filetree_rename()}
				</button>
			{/if}
			<button
				class="hover:preset-tonal-error text-error-600 flex w-full items-center gap-2.5 px-3 py-1.5 text-left"
				onclick={() => {
					const e = ctxMenu.entry;
					ctxMenu = null;
					if (e) confirmDelete(e);
				}}
			>
				<Trash2 class="size-4" />
				{deleteCount(ctxMenu.entry) > 1 ? m.filetree_delete_many({ count: deleteCount(ctxMenu.entry) }) : m.filetree_delete()}
			</button>
		{/if}
	</div>
{/if}
