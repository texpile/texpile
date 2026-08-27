<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { Menu, Portal } from '@skeletonlabs/skeleton-svelte';
	// Menu is Skeleton's here, so lucide's hamburger comes in aliased
	import { Menu as MenuIcon, MoreHorizontal } from '@lucide/svelte';
	import { editorConfigStore, cursorInCm } from '$lib/stores/editorStore';
	import { recentFolders } from '$lib/workspace/workspaceStore';
	import { isDesktop, openNewWindow, openFolderInNewWindow } from '$lib/workspace/fileSystem';
	import { isMac } from '$lib/platform';
	import { setSpellcheckEnabled } from '$lib/editor/spellcheck/spellcheckConfig';
	import { hasVisualMode, isRawTextKind, formatOf, type FileKind } from '$lib/workspace/documentBuffer.svelte';
	import { editSelect, formatSelect } from './menuBarCommands';
	import { preferencesOpen, dictionaryOpen, shortcutsOpen } from '$lib/stores/dialogStore';
	import { commandPalette } from '$lib/workspace/commandPalette.svelte';
	import { attachNativeMenu, publishMenuState } from '$lib/workspace/nativeMenu';
	import { titleBarLayout } from '$lib/chrome/titleBarLayout.svelte';
	import { whatsNewOpen } from '$lib/whatsNew';
	import { triggerClass, contentClass } from './menubar/menuBarStyles';
	import { makeInsertHandlers } from './menubar/menuBarInsert';
	import { checkUpdates } from './menubar/menuBarUpdates';
	import FileMenu from './menubar/FileMenu.svelte';
	import EditMenu from './menubar/EditMenu.svelte';
	import ViewMenu from './menubar/ViewMenu.svelte';
	import InsertMenu from './menubar/InsertMenu.svelte';
	import FormatMenu from './menubar/FormatMenu.svelte';
	import SpellingMenu from './menubar/SpellingMenu.svelte';
	import TerminalMenu from './menubar/TerminalMenu.svelte';
	import HelpMenu from './menubar/HelpMenu.svelte';
	import TextPrompt from './menubar/TextPrompt.svelte';
	import SupportModal from './menubar/SupportModal.svelte';
	import ImagePickerInput from './menubar/ImagePickerInput.svelte';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		disabled?: boolean;
		/** what is open in the editor pane; decides which menus apply and which dialect they write */
		fileKind?: FileKind;
		imageDir?: string;
		/**
		 * Create a new file. `ext` (tex/bib/cls/sty) seeds the name + content; omitted = a plain new file.
		 *
		 * Undefined when the workspace cannot take tree writes - a guest edits through the shared CRDT
		 * and owns none of the host's folder. Presence of the callback IS the gate, the way
		 * onShareSession and onCloseWorkspace already work, so there is one thing to get right rather
		 * than a callback plus a flag that can disagree.
		 */
		onNewFile?: (ext?: string) => void;
		/** the compile target is Typst: New offers .typ instead of .tex/.cls/.sty (md either way) */
		typstProject?: boolean;
		onOpenFolder?: (path?: string) => void;
		/** Close the current folder and return to the Start screen. */
		onCloseWorkspace?: () => void;
		onSave?: () => void;
		/** shared-session dialog (desktop only). */
		onShareSession?: () => void;
		/** Terminal menu (shown only in the desktop app). */
		terminalAvailable?: boolean;
		terminalVisible?: boolean;
		onCompile?: () => void;
		onConfigureCompile?: () => void;
		onNewTerminal?: () => void;
		onToggleTerminal?: () => void;
		/** Reindent the current document via latexindent (opens the confirm-first modal). */
		onFormatDocument?: () => void;
		/** Open the bundled Texpile Tutorial project (switches the workspace to it). */
		onOpenTutorial?: () => void;
		/** whole-window zoom, shown as a percentage in the View menu. */
		uiZoomPercent?: number;
		onZoomIn?: () => void;
		onZoomOut?: () => void;
		onZoomReset?: () => void;
		/** open the citation picker (project + personal library) instead of a bare skeleton */
		onPickCitation?: () => void;
	};
	let {
		disabled = false,
		fileKind = null,
		imageDir,
		onNewFile,
		typstProject = false,
		onOpenFolder,
		onCloseWorkspace,
		onSave,
		onShareSession,
		terminalAvailable = false,
		terminalVisible = false,
		onCompile,
		onConfigureCompile,
		onNewTerminal,
		onToggleTerminal,
		onFormatDocument,
		onOpenTutorial,
		uiZoomPercent = 100,
		onZoomIn,
		onZoomOut,
		onZoomReset,
		onPickCitation
	}: Props = $props();

	// What the open file supports, not just whether one is open. A PDF or an image has no text
	// buffer, so Edit's undo/redo would reach nothing; a .bib edits as raw text, so Insert/Format
	// have no structured document to write into; and a .typ or .md must never be offered LaTeX.
	/** there is a text buffer (visual or raw) for Edit/Spelling to act on */
	const editable = $derived(!disabled && (hasVisualMode(fileKind) || isRawTextKind(fileKind)));
	/** there is a structured (tex/md/typ) document for Insert/Format to act on */
	const structured = $derived(!disabled && hasVisualMode(fileKind));
	/** which syntax Insert/Format write; only meaningful while `structured` */
	const dialect = $derived(formatOf(fileKind));

	/**
	 * Progressive overflow. The menus render inline left to right for as long as they fit, and the
	 * rest move into a trailing overflow button - `File Edit View ...` - rather than the whole bar
	 * collapsing at once. Help goes first because it is last and least used; zero visible is the
	 * degenerate case and looks like the hamburger it used to be.
	 *
	 * TitleBar decides how many fit: it is the only place that can measure the row, the menus and the
	 * window controls together, and the budget comes from keeping the command center centred.
	 */
	// file edit view insert format spelling [terminal] help. The count has to follow terminalAvailable
	// rather than being a constant 8: the fit loop advances one step per resize, so a menu that renders
	// nothing would be a step that frees no width, produce no resize, and stall the loop one short.
	const menuCount = $derived(terminalAvailable ? 8 : 7);
	const helpIndex = $derived(terminalAvailable ? 7 : 6);
	$effect(() => {
		const n = menuCount;
		untrack(() => titleBarLayout.setTotal(n)); // setTotal writes what it reads; see TitleBar's fit()
	});
	const visible = $derived(titleBarLayout.visibleMenus);
	const overflowing = $derived(visible < menuCount);
	/** does menu `i` belong to the pass currently rendering? */
	function showAt(i: number, overflow: boolean) {
		return overflow ? i >= visible : i < visible;
	}

	let imagePicker: ImagePickerInput;
	let textPrompt: TextPrompt;
	let supportModal: SupportModal;

	function viewSelect(value: string) {
		if (value === 'zoom-in') onZoomIn?.();
		else if (value === 'zoom-out') onZoomOut?.();
		else if (value === 'zoom-reset') onZoomReset?.();
	}

	function helpSelect(value: string) {
		if (value === 'shortcuts') shortcutsOpen.current = true;
		else if (value === 'whatsnew') whatsNewOpen.current = true;
		else if (value === 'docs') window.open('https://texpile.com/docs', '_blank', 'noopener,noreferrer');
		else if (value === 'discord') window.open('https://discord.gg/7wanVzCBWf', '_blank', 'noopener,noreferrer');
		else if (value === 'support') supportModal?.show();
		else if (value === 'updates') void checkUpdates();
	}

	function fileSelect(value: string) {
		if (value === 'save') onSave?.();
		else if (value === 'new-window') openNewWindow();
		else if (value === 'open-folder-new-window') openFolderInNewWindow();
		else if (value === 'share-session') onShareSession?.();
		else if (value === 'close-workspace') onCloseWorkspace?.();
		else if (value === 'preferences') preferencesOpen.current = true;
	}
	function newFileSelect(ext: string) {
		onNewFile?.(ext);
	}

	// "newfolder" opens the native picker; any other value is a recent folder path
	function openFolderSelect(value: string) {
		if (value === 'newfolder') onOpenFolder?.();
		else onOpenFolder?.(value);
	}

	const { mathSelect, insertSelect } = makeInsertHandlers({
		dialect: () => dialect,
		askText: (title, initial) => textPrompt.askText(title, initial),
		pickImage: () => imagePicker?.pick(),
		pickCitation: onPickCitation
	});

	const spellcheckOn = $derived(editorConfigStore.current?.spellcheck ?? false);
	function spellcheckSelect(value: string) {
		if (value === 'toggle') setSpellcheckEnabled(!spellcheckOn);
		else if (value === 'dictionary') dictionaryOpen.current = true;
	}

	function terminalSelect(value: string) {
		if (value === 'compile') onCompile?.();
		else if (value === 'configure') onConfigureCompile?.();
		else if (value === 'new') onNewTerminal?.();
		else if (value === 'toggle') onToggleTerminal?.();
	}

	// On macOS the menus are drawn by the system menu bar, and a native selection arrives here as the
	// same `menu:value` string a trigger would have produced - so both paths run one dispatcher.
	const nativeMenus = isMac && isDesktop();
	onMount(() =>
		attachNativeMenu({
			file: fileSelect,
			newFile: newFileSelect,
			openFolder: openFolderSelect,
			edit: (v) => (v === 'palette' ? commandPalette.show() : editSelect(v)),
			view: viewSelect,
			insert: (v) => void insertSelect(v),
			math: mathSelect,
			format: (v) => (v === 'format-document' ? onFormatDocument?.() : formatSelect(v, dialect)),
			spelling: spellcheckSelect,
			terminal: terminalSelect,
			help: (v) => (v === 'tutorial' ? onOpenTutorial?.() : helpSelect(v))
		})
	);
	// what the native bar needs to know about this window; re-sent whenever any of it changes
	$effect(() =>
		publishMenuState({
			disabled,
			editable,
			structured,
			dialect,
			cursorInCm: cursorInCm.current,
			spellcheck: spellcheckOn,
			terminalAvailable,
			terminalVisible,
			canShare: !!onShareSession,
			canCloseWorkspace: !!onCloseWorkspace,
			canFormat: !!onFormatDocument,
			canNewFile: !!onNewFile,
			typstProject,
			canInsertImage: !!imageDir,
			canOpenFolder: !!onOpenFolder,
			canTutorial: !!onOpenTutorial,
			recentFolders: recentFolders.current
		})
	);
</script>

<!-- Lives inside TitleBar's row, so the row owns the border and the height; this only lays out its
     own triggers. no-drag because the row around it is a drag region.
     On macOS the triggers are gone and the real menu bar carries them (windowChrome.ts), but the
     component still mounts: it owns Preferences, the dictionary, the shortcut sheet and the image
     picker, none of which have anything to do with where the menus are drawn.
     preventDefault on mousedown so opening a menu doesn't blur the editor; inserts land at the cursor -->
{#if !nativeMenus}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<!-- no left padding: the app icon before it already provides the gap, and doubling up pushed File
	     away from the mark. The triggers carry their own px-2.5 for their hover targets. -->
	<nav class="app-no-drag flex items-center gap-0.5 pr-1" data-keep-caret onmousedown={(e) => e.preventDefault()}>
		{@render topMenus(false)}
		{#if overflowing}
			<!-- the leftovers, as submenus. A hamburger when it holds everything, an ellipsis when it
			     is genuinely an overflow of a bar that still shows some menus. -->
			<Menu>
				<Menu.Trigger class={triggerClass} aria-label={m.menubar_all_menus()} title={m.menubar_all_menus()}>
					{#if visible === 0}<MenuIcon class="size-4" />{:else}<MoreHorizontal class="size-4" />{/if}
				</Menu.Trigger>
				<Portal>
					<Menu.Positioner>
						<Menu.Content class={contentClass}>
							{@render topMenus(true)}
						</Menu.Content>
					</Menu.Positioner>
				</Portal>
			</Menu>
		{/if}
	</nav>
{/if}

<!--
	The eight top-level menus, once. Rendered straight into the row normally, or into a single
	dropdown when the window is too narrow for them (VS Code's compact menu bar). Each menu's
	MenuBarTrigger switches between the two layouts, so everything underneath is shared -
	duplicating the item lists per layout would have guaranteed they drift.
-->
{#snippet topMenus(overflow: boolean)}
	{#if showAt(0, overflow)}
		<FileMenu
			index={0}
			select={fileSelect}
			{newFileSelect}
			{openFolderSelect}
			canNewFile={!!onNewFile}
			{typstProject}
			canOpenFolder={!!onOpenFolder}
			canCloseWorkspace={!!onCloseWorkspace}
			canShareSession={!!onShareSession}
		/>
	{/if}
	{#if showAt(1, overflow)}
		<EditMenu index={1} select={(v) => (v === 'palette' ? commandPalette.show() : editSelect(v))} {editable} />
	{/if}
	{#if showAt(2, overflow)}
		<ViewMenu index={2} select={viewSelect} {uiZoomPercent} />
	{/if}
	{#if showAt(3, overflow)}
		<InsertMenu index={3} select={(v) => void insertSelect(v)} {mathSelect} {structured} {dialect} canInsertImage={!!imageDir} />
	{/if}
	{#if showAt(4, overflow)}
		<FormatMenu
			index={4}
			select={(v) => (v === 'format-document' ? onFormatDocument?.() : formatSelect(v, dialect))}
			{structured}
			{dialect}
			{fileKind}
			canFormatDocument={!!onFormatDocument}
		/>
	{/if}
	{#if showAt(5, overflow)}
		<SpellingMenu index={5} select={spellcheckSelect} {editable} {spellcheckOn} />
	{/if}
	{#if terminalAvailable && showAt(6, overflow)}
		<TerminalMenu index={6} select={terminalSelect} {terminalVisible} />
	{/if}
	{#if showAt(helpIndex, overflow)}
		<HelpMenu index={helpIndex} select={(v) => (v === 'tutorial' ? onOpenTutorial?.() : helpSelect(v))} canTutorial={!!onOpenTutorial} />
	{/if}
{/snippet}

<!-- outside the nav so it survives on macOS, where the nav is not rendered at all -->
<ImagePickerInput bind:this={imagePicker} {imageDir} />

<!-- Preferences, the dictionary and the shortcut sheet are mounted by WindowDialogs, not here:
     a guest session renders no menu bar, and they are window features rather than menu features.
     This file still OPENS them, through dialogStore. -->
<TextPrompt bind:this={textPrompt} />
<SupportModal bind:this={supportModal} />
