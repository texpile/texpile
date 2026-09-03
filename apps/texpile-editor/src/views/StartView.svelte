<script lang="ts">
	import { tip } from '$lib/components/tooltip.svelte';
	import { navigate } from '$lib/router.svelte';
	import { AppWindow, Folder, FolderOpen, Loader2, Settings, Users } from '@lucide/svelte';
	import { modKey } from '$lib/platform';
	import { whatsNewOpen, hasUnseenWhatsNew } from '$lib/whatsNew';
	import AppFrame from '$lib/chrome/AppFrame.svelte';
	import RecentFoldersModal from '$lib/modals/start/RecentFoldersModal.svelte';
	// dark wordmark for light backgrounds, white one for dark mode
	import logoOnLight from '$branding/Logo-dark.svg';
	import logoOnDark from '$branding/Logo-light.svg';
	import { pickFolder, isDesktop, openNewWindow, basename } from '$lib/workspace/fileSystem';
	import { recentFolders, setMainFile } from '$lib/workspace/workspaceStore';
	import { openFolderInWindow } from '$lib/workspace/openWorkspace';
	import { openTutorialProject } from '$lib/workspace/starters';
	import { m } from '$lib/paraglide/messages';

	let busy = $state(false);
	let error = $state<string | null>(null);
	// the start screen must fit a default window without a scrollbar, so a long history
	// lives in a popup instead of inline
	const RECENT_COLLAPSED_COUNT = 5;
	let recentModalOpen = $state(false);
	const visibleRecents = $derived(recentFolders.current.slice(0, RECENT_COLLAPSED_COUNT));
	let tutorialModalOpen = $state(false);
	let prefsOpen = $state(false); // the menu bar isn't on this screen, so settings need a way in from here
	const appVersion = __APP_VERSION__; // injected by Vite from package.json

	// both modals chain into the editor bundle (prefs reaches harper via spellcheck), so they
	// load on first open instead of riding in the boot chunk
	let TutorialModal = $state<typeof import('$lib/modals/start/TutorialConfirmModal.svelte').default | null>(null);
	let PrefsDialog = $state<typeof import('$lib/modals/window/PreferencesDialog.svelte').default | null>(null);

	async function showTutorialModal() {
		TutorialModal ??= (await import('$lib/modals/start/TutorialConfirmModal.svelte')).default;
		tutorialModalOpen = true;
	}

	async function showPrefs() {
		PrefsDialog ??= (await import('$lib/modals/window/PreferencesDialog.svelte')).default;
		prefsOpen = true;
	}

	// every entry on this screen is the same row: muted icon, label, optional shortcut on the right
	const rowClass =
		'hover:bg-surface-200-800 rounded-base flex w-full items-center gap-2.5 px-2 py-1.5 text-left text-sm disabled:opacity-50';

	// WorkspaceView is route-split (App.svelte); kick its chunk off as soon as an open begins so
	// it streams while the folder scans. failures are non-fatal here: App's own loader retries
	// and owns the error path
	function preloadWorkspace() {
		return void import('./workspace/WorkspaceView.svelte').catch(() => {});
	}

	// TutorialConfirmModal has the user pick an empty folder and confirm first; this only runs after
	async function openTutorial(pickedRoot: string) {
		if (busy) return;
		busy = true;
		error = null;
		preloadWorkspace(); // ahead of the copy: the chunk streams while the template lands on disk
		try {
			const { root, mainFile } = await openTutorialProject(pickedRoot);
			setMainFile(root, mainFile);
			if ((await openFolderInWindow(root, mainFile)) === 'missing') error = m.start_error_tutorial();
		} catch (e) {
			error = e instanceof Error ? e.message : m.start_error_tutorial();
		} finally {
			busy = false;
		}
	}

	async function openFolder(path?: string) {
		preloadWorkspace();
		error = null;
		const root = path ?? (await pickFolder());
		if (!root) return;
		busy = true;
		try {
			// 'elsewhere' means another window already had it and was focused: stay on the start screen
			if ((await openFolderInWindow(root)) === 'missing') error = m.start_error_open_folder();
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
<AppFrame>
	<div class="flex min-h-full shrink-0 justify-center px-6 py-12">
		<div class="my-auto w-full max-w-md">
			<img src={logoOnLight} alt="Texpile" class="mx-auto mb-8 h-9 w-auto dark:hidden" />
			<img src={logoOnDark} alt="Texpile" class="mx-auto mb-8 hidden h-9 w-auto dark:block" />

			<div class="mb-1 flex items-center gap-3">
				<span class="text-muted shrink-0 text-xs font-semibold tracking-wider uppercase">{m.start_heading()}</span>
				<span class="border-surface-200-800 h-px flex-1 border-t"></span>
			</div>

			<button class={rowClass} onclick={() => openFolder()} disabled={busy}>
				{#if busy}<Loader2 class="text-muted size-4 shrink-0 animate-spin" />{:else}<FolderOpen class="text-muted size-4 shrink-0" />{/if}
				<span>{m.start_open_folder()}</span>
			</button>
			<button class={rowClass} onclick={() => navigate('/session')}>
				<Users class="text-muted size-4 shrink-0" />
				<span>{m.start_join_session()}</span>
			</button>
			{#if isDesktop()}
				<button class={rowClass} onclick={openNewWindow}>
					<AppWindow class="text-muted size-4 shrink-0" />
					<span>{m.start_new_window()}</span>
					<span class="text-faint ml-auto shrink-0 pl-4 text-xs">{modKey('Shift', 'N')}</span>
				</button>
			{/if}
			<button class={rowClass} onclick={showPrefs}>
				<Settings class="text-muted size-4 shrink-0" />
				<span>{m.menubar_preferences()}</span>
			</button>

			<!-- onboarding, not a primary action: light so it doesn't compete with the rows above -->
			<button
				class="text-muted hover:text-surface-950-50 mt-2 px-2 text-xs disabled:opacity-50"
				onclick={showTutorialModal}
				disabled={busy}
			>
				{m.start_tutorial_cta()}
			</button>

			{#if error}
				<p class="text-error-500 mt-2 px-2 text-sm">{error}</p>
			{/if}

			{#if recentFolders.current.length > 0}
				<div class="mt-7 mb-1 flex items-center gap-3">
					<span class="text-muted shrink-0 text-xs font-semibold tracking-wider uppercase">{m.start_recent_heading()}</span>
					<span class="border-surface-200-800 h-px flex-1 border-t"></span>
				</div>
				{#each visibleRecents as folder (folder)}
					<!-- min-w-0 on the row and the path: flex items default to min-width:auto, so
					     without it `truncate` never engages and long paths overflow -->
					<button class="{rowClass} group min-w-0" onclick={() => openFolder(folder)} disabled={busy} use:tip={folder}>
						<Folder class="text-muted size-4 shrink-0" />
						<!-- inner baseline row: the icon stays centred in the row, but the name (text-sm) and
						     path (text-xs) sit on a shared baseline, else the smaller one rides low -->
						<span class="flex min-w-0 flex-1 items-baseline gap-2">
							<span class="max-w-[45%] shrink-0 truncate group-hover:underline">{basename(folder)}</span>
							<span class="text-faint min-w-0 truncate text-xs">{folder}</span>
						</span>
					</button>
				{/each}
				{#if recentFolders.current.length > RECENT_COLLAPSED_COUNT}
					<button class="text-muted hover:text-surface-950-50 mt-1 px-2 text-xs" onclick={() => (recentModalOpen = true)}>
						{m.start_recent_show_all({ count: recentFolders.current.length })}
					</button>
				{/if}
			{/if}

			<!-- release notes belong next to the version, not competing with the actions above -->
			<div class="border-surface-200-800 text-muted mt-8 flex items-center justify-between gap-2 border-t px-2 pt-3 text-xs">
				<span>{m.menubar_version_footer({ version: appVersion })}</span>
				<button class="hover:text-surface-950-50 inline-flex items-center gap-1.5" onclick={() => (whatsNewOpen.current = true)}>
					{m.whatsnew_menu_label()}
					{#if hasUnseenWhatsNew.current}<span class="bg-primary-500 size-1.5 shrink-0 rounded-full"></span>{/if}
				</button>
			</div>
		</div>
	</div>
</AppFrame>

<RecentFoldersModal bind:open={recentModalOpen} folders={recentFolders.current} onPick={(folder) => openFolder(folder)} />

{#if TutorialModal}
	<TutorialModal bind:open={tutorialModalOpen} onConfirm={openTutorial} />
{/if}
{#if PrefsDialog}
	<PrefsDialog bind:open={prefsOpen} />
{/if}
