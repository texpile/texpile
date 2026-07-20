<script lang="ts">
	import { navigate } from '$lib/router.svelte';
	import { AppWindow, Folder, FolderOpen, Loader2, Settings, Users } from '@lucide/svelte';
	import { modKey } from '$lib/platform';
	import { whatsNewOpen, hasUnseenWhatsNew } from '$lib/whatsNew';
	// dark wordmark for light backgrounds, white one for dark mode
	import logoOnLight from '$lib/assets/logo/Logo-dark.svg';
	import logoOnDark from '$lib/assets/logo/Logo-light.svg';
	import {
		pickFolder,
		claimWorkspace,
		isDesktop,
		openNewWindow,
		scanTexFiles,
		statFile,
		basename,
		type TexFile
	} from '$lib/workspace/fileSystem';
	import {
		workspaceRoot,
		texFiles,
		recentFolders,
		addRecentFolder,
		activeFilePath,
		setMainFile,
		savedLastFile
	} from '$lib/workspace/workspaceStore';
	import { updateSettings } from '$lib/settings';
	import TutorialConfirmModal from '$lib/editor/comp/TutorialConfirmModal.svelte';
	import PreferencesDialog from '$lib/editor/comp/PreferencesDialog.svelte';
	import { openTutorialProject } from '$lib/workspace/starters';
	import { m } from '$lib/paraglide/messages';

	let busy = $state(false);
	let error = $state<string | null>(null);
	let tutorialModalOpen = $state(false);
	let prefsOpen = $state(false); // the menu bar isn't on this screen, so settings need a way in from here
	const appVersion = __APP_VERSION__; // injected by Vite from package.json

	// every entry on this screen is the same row: muted icon, label, optional shortcut on the right
	const rowClass =
		'hover:bg-surface-200-800 rounded-base flex w-full items-center gap-2.5 px-2 py-1.5 text-left text-sm disabled:opacity-50';

	async function finishOpen(root: string, active: string | null) {
		// belt & braces: template/tutorial roots are freshly created, but claiming is cheap
		if (!(await claimWorkspace(root)).ok) return;
		const { files } = await scanTexFiles(root);
		workspaceRoot.set(root);
		texFiles.set(files);
		activeFilePath.set(active ?? files[0]?.path ?? null);
		addRecentFolder(root);
		updateSettings({ lastFolder: root });
		navigate('/workspace');
	}

	// the file to open with a folder: the one last open there (if it still exists), else the first
	async function initialFile(root: string, files: TexFile[]): Promise<string | null> {
		const saved = savedLastFile(root);
		if (saved && (await statFile(saved)).exists) return saved;
		return files[0]?.path ?? null;
	}

	// TutorialConfirmModal has the user pick an empty folder and confirm first; this only runs after
	async function openTutorial(pickedRoot: string) {
		if (busy) return;
		busy = true;
		error = null;
		try {
			const { root, mainFile } = await openTutorialProject(pickedRoot);
			setMainFile(root, mainFile);
			await finishOpen(root, mainFile);
		} catch (e) {
			error = e instanceof Error ? e.message : m.start_error_tutorial();
		} finally {
			busy = false;
		}
	}

	async function openFolder(path?: string) {
		error = null;
		const root = path ?? (await pickFolder());
		if (!root) return;
		busy = true;
		try {
			// already open in another window: that window was focused, stay on the start screen
			if (!(await claimWorkspace(root)).ok) return;
			const { files } = await scanTexFiles(root);
			workspaceRoot.set(root);
			texFiles.set(files);
			activeFilePath.set(await initialFile(root, files));
			addRecentFolder(root);
			updateSettings({ lastFolder: root });
			navigate('/workspace');
		} catch (e) {
			error = e instanceof Error ? e.message : m.start_error_open_folder();
		} finally {
			busy = false;
		}
	}

	// NOTE: session restore no longer lives here. The main process remembers the open folders
	// (settings.openFolders) and pushes a main:open-folder to each restored window at launch;
	// App.svelte handles it. A StartView-side auto-reopen would make every NEW window reopen
	// the last folder too.
</script>

<svelte:head><title>Texpile</title></svelte:head>

<!-- my-auto rather than centering the container: a tall list on a short window would otherwise
     push the top above the scroll origin, where it can't be reached -->
<div class="flex min-h-screen justify-center px-6 py-12">
	<div class="my-auto w-full max-w-md">
		<img src={logoOnLight} alt="Texpile" class="mx-auto mb-8 h-9 w-auto dark:hidden" />
		<img src={logoOnDark} alt="Texpile" class="mx-auto mb-8 hidden h-9 w-auto dark:block" />

		<div class="mb-1 flex items-center gap-3">
			<span class="text-surface-500 shrink-0 text-xs font-semibold tracking-wider uppercase">{m.start_heading()}</span>
			<span class="border-surface-200-800 h-px flex-1 border-t"></span>
		</div>

		<button class={rowClass} onclick={() => openFolder()} disabled={busy}>
			{#if busy}<Loader2 class="text-surface-500 size-4 shrink-0 animate-spin" />{:else}<FolderOpen
					class="text-surface-500 size-4 shrink-0"
				/>{/if}
			<span>{m.start_open_folder()}</span>
		</button>
		<button class={rowClass} onclick={() => navigate('/session')}>
			<Users class="text-surface-500 size-4 shrink-0" />
			<span>{m.start_join_session()}</span>
		</button>
		{#if isDesktop()}
			<button class={rowClass} onclick={openNewWindow}>
				<AppWindow class="text-surface-500 size-4 shrink-0" />
				<span>{m.start_new_window()}</span>
				<span class="text-surface-400 ml-auto shrink-0 pl-4 text-xs">{modKey('Shift', 'N')}</span>
			</button>
		{/if}
		<button class={rowClass} onclick={() => (prefsOpen = true)}>
			<Settings class="text-surface-500 size-4 shrink-0" />
			<span>{m.menubar_preferences()}</span>
		</button>

		<!-- onboarding, not a primary action: light so it doesn't compete with the rows above -->
		<button
			class="text-surface-500 hover:text-surface-950-50 mt-2 px-2 text-xs disabled:opacity-50"
			onclick={() => (tutorialModalOpen = true)}
			disabled={busy}
		>
			{m.start_tutorial_cta()}
		</button>

		{#if error}
			<p class="text-error-500 mt-2 px-2 text-sm">{error}</p>
		{/if}

		{#if $recentFolders.length > 0}
			<div class="mt-7 mb-1 flex items-center gap-3">
				<span class="text-surface-500 shrink-0 text-xs font-semibold tracking-wider uppercase">{m.start_recent_heading()}</span>
				<span class="border-surface-200-800 h-px flex-1 border-t"></span>
			</div>
			{#each $recentFolders as folder (folder)}
				<!-- min-w-0 on the row and the path: flex items default to min-width:auto, so
					     without it `truncate` never engages and long paths overflow -->
				<button class="{rowClass} group min-w-0" onclick={() => openFolder(folder)} disabled={busy} title={folder}>
					<Folder class="text-surface-500 size-4 shrink-0" />
					<!-- inner baseline row: the icon stays centred in the row, but the name (text-sm) and
						     path (text-xs) sit on a shared baseline, else the smaller one rides low -->
					<span class="flex min-w-0 flex-1 items-baseline gap-2">
						<span class="max-w-[45%] shrink-0 truncate group-hover:underline">{basename(folder)}</span>
						<span class="text-surface-400 min-w-0 truncate text-xs">{folder}</span>
					</span>
				</button>
			{/each}
		{/if}

		<!-- release notes belong next to the version, not competing with the actions above -->
		<div class="border-surface-200-800 text-surface-500 mt-8 flex items-center justify-between gap-2 border-t px-2 pt-3 text-xs">
			<span>{m.menubar_version_footer({ version: appVersion })}</span>
			<button class="hover:text-surface-950-50 inline-flex items-center gap-1.5" onclick={() => whatsNewOpen.set(true)}>
				{m.whatsnew_menu_label()}
				{#if $hasUnseenWhatsNew}<span class="bg-primary-500 size-1.5 shrink-0 rounded-full"></span>{/if}
			</button>
		</div>
	</div>
</div>

<TutorialConfirmModal bind:open={tutorialModalOpen} onConfirm={openTutorial} />
<PreferencesDialog bind:open={prefsOpen} />
