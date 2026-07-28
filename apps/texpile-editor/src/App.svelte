<script lang="ts">
	import { onMount } from 'svelte';
	import { route, navigate } from '$lib/router.svelte';
	import { native, claimWorkspace, scanTexFiles, statFile, dirname, openNewWindow } from '$lib/workspace/fileSystem';
	import { workspaceRoot, texFiles, activeFilePath, addRecentFolder, savedLastFile } from '$lib/workspace/workspaceStore';
	import { settings, updateSettings, loadSettings } from '$lib/settings';
	import { checkForUpdate, updateModalOpen } from '$lib/updates';
	import UpdateAvailableModal from '$lib/components/UpdateAvailableModal.svelte';
	import WhatsNewModal from '$lib/components/WhatsNewModal.svelte';
	import { entriesToShow, whatsNewOpen } from '$lib/whatsNew';

	// every released CHANGELOG.md entry, injected at build (vite.config)
	const whatsNew = __WHATS_NEW__;
	// the panel is opened from Help / the start screen, never thrown at you on launch
	const whatsNewEntries = $derived(entriesToShow(whatsNew, $settings.whatsNewSeen));

	import StartView from './views/StartView.svelte';
	import ErrorView from './views/ErrorView.svelte';

	// route-split: StartView stays static (first paint), the editor views load on demand so the
	// boot chunk stays small
	let WorkspaceView = $state<typeof import('./views/WorkspaceView.svelte').default | null>(null);
	let SessionRoute = $state<typeof import('./views/SessionRoute.svelte').default | null>(null);

	// a view chunk can fail transiently: in dev Vite re-optimizes deps mid-session and serves 504s
	// for a beat, and in prod an auto-update swaps the hashed assets under a running window.
	// Retry before giving up, and never leave the route rendering nothing (that reads as a hang).
	let chunkError = $state(false);

	async function retryImport<T>(load: () => Promise<T>): Promise<T | null> {
		for (let attempt = 1; attempt <= 3; attempt++) {
			try {
				const mod = await load();
				chunkError = false;
				return mod;
			} catch (e) {
				console.error(`view chunk failed (attempt ${attempt}/3)`, e);
				if (attempt < 3) await new Promise((r) => setTimeout(r, 300 * attempt));
			}
		}
		chunkError = true;
		return null;
	}

	// one in-flight load per view; cleared on failure so a later navigation can retry
	let workspaceLoad: Promise<void> | null = null;
	let sessionLoad: Promise<void> | null = null;
	const loadWorkspace = () =>
		(workspaceLoad ??= retryImport(() => import('./views/WorkspaceView.svelte')).then((mod) => {
			if (mod) WorkspaceView = mod.default;
			else workspaceLoad = null;
		}));
	const loadSession = () =>
		(sessionLoad ??= retryImport(() => import('./views/SessionRoute.svelte')).then((mod) => {
			if (mod) SessionRoute = mod.default;
			else sessionLoad = null;
		}));

	// covers reloads landing straight on a hash and any navigate() we didn't preload for
	$effect(() => {
		if (route.path === '/workspace') loadWorkspace();
		else if (route.path === '/session') loadSession();
	});

	onMount(async () => {
		const s = await loadSettings();
		// once per app SESSION, not per window: without this every new window would re-check
		// for updates (claim falls back to true in browser dev)
		const primary = (await native()?.claimStartupTasks?.()) ?? true;
		if (!primary || !s.checkForUpdates) return;
		// a failed silent check stays silent; the manual Help-menu check surfaces errors
		if ((await checkForUpdate()) === 'update') updateModalOpen.set(true);
	});

	// OS "Open With" hands us a .tex via the main process; open its folder and activate the file
	onMount(() => {
		const n = native();
		if (!n?.onOpenPath) return;
		return n.onOpenPath(async (filePath) => {
			try {
				loadWorkspace(); // stream the workspace chunk while the folder scans
				const root = dirname(filePath);
				// main routes files to the window already owning the folder, so a failed claim
				// (folder open elsewhere) only happens in odd races; that window was focused
				if (!(await claimWorkspace(root)).ok) return;
				const { files } = await scanTexFiles(root);
				const match = files.find((f) => f.path === filePath || f.path.toLowerCase() === filePath.toLowerCase());
				workspaceRoot.set(root);
				texFiles.set(files);
				activeFilePath.set(match?.path ?? filePath);
				addRecentFolder(root);
				updateSettings({ lastFolder: root });
				navigate('/workspace');
			} catch {
				/* ignore an OS open we can't honor */
			}
		});
	});

	// session restore + "Open Folder in New Window": the main process pushes a folder for this
	// window to open (the StartView-side auto-reopen is gone; it would misfire in new windows)
	onMount(() => {
		const n = native();
		if (!n?.onOpenFolder) return;
		return n.onOpenFolder(async (root) => {
			try {
				loadWorkspace(); // stream the workspace chunk while the folder scans
				if (!(await claimWorkspace(root)).ok) return;
				const { files } = await scanTexFiles(root);
				// reopen the file the user last had open in this folder, like the old restore did
				const saved = savedLastFile(root);
				const active = saved && (await statFile(saved)).exists ? saved : (files[0]?.path ?? null);
				workspaceRoot.set(root);
				texFiles.set(files);
				activeFilePath.set(active);
				addRecentFolder(root);
				updateSettings({ lastFolder: root });
				navigate('/workspace');
			} catch {
				/* folder is gone or unreadable: stay on the start screen */
			}
		});
	});

	// app-level so it works on the start screen too, not just inside a workspace. There is no
	// native menu to hang an accelerator on (main.ts clears it outside macOS), so it lives here.
	function onKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'n') {
			e.preventDefault();
			openNewWindow();
		}
	}

	import { Toast } from '@skeletonlabs/skeleton-svelte';
	import { toaster } from '$lib/modals/toaster-svelte';
	import ConfirmHost from '$lib/modals/ConfirmHost.svelte';

	import MobileSupportBanner from '$lib/components/MobileSupportBanner.svelte';
</script>

<svelte:window onkeydown={onKeydown} />

<Toast.Group {toaster}>
	{#snippet children(toast)}
		<Toast {toast}>
			<Toast.Message>
				<Toast.Title>{toast.title}</Toast.Title>
				<Toast.Description>{toast.description}</Toast.Description>
			</Toast.Message>
			{#if toast.action}
				<Toast.ActionTrigger>{toast.action.label}</Toast.ActionTrigger>
			{/if}
			<Toast.CloseTrigger />
		</Toast>
	{/snippet}
</Toast.Group>

<ConfirmHost />

<div class="pointer-events-none fixed inset-x-0 top-0 z-[1100] flex flex-col">
	<div class="pointer-events-auto">
		<MobileSupportBanner />
	</div>
</div>

{#if route.path === '/'}
	<StartView />
{:else if route.path === '/workspace'}
	<!-- null-render while the chunk loads; usually preloaded by the open handlers already -->
	{#if WorkspaceView}<WorkspaceView />{:else if chunkError}<ErrorView status={500} />{/if}
{:else if route.path === '/session'}
	{#if SessionRoute}<SessionRoute />{:else if chunkError}<ErrorView status={500} />{/if}
{:else}
	<ErrorView status={404} />
{/if}

{#if whatsNewEntries.length}
	<WhatsNewModal bind:open={$whatsNewOpen} entries={whatsNewEntries} />
{/if}
<UpdateAvailableModal />

<noscript>
	<div class="fixed inset-x-0 bottom-0 border-t-4 border-red-500 bg-gray-100 p-4 text-red-700" role="alert">
		<h1 class="mb-2 text-xl font-bold">JavaScript Required</h1>
		<p>This website requires JavaScript to function properly. Please enable JavaScript in your browser settings.</p>
	</div>
</noscript>

<style>
	/* toasts default to transparent, give them a solid surface */
	:global([data-scope='toast'][data-part='root']) {
		background-color: var(--color-surface-50, #ffffff);
		border: 1px solid var(--color-surface-300, #cbd5e1);
		box-shadow: 0 10px 30px rgb(0 0 0 / 0.22);
	}
	:global(.dark [data-scope='toast'][data-part='root']) {
		background-color: var(--color-surface-950, #0b1220);
		border-color: var(--color-surface-700, #334155);
	}
	/* explicit text colors, the defaults were too low-contrast on the surface */
	:global([data-scope='toast'][data-part='title']) {
		color: var(--color-surface-950, #0b1220);
		font-weight: 600;
	}
	:global([data-scope='toast'][data-part='description']) {
		color: var(--color-surface-700, #334155);
	}
	:global(.dark [data-scope='toast'][data-part='title']) {
		color: var(--color-surface-50, #f8fafc);
	}
	:global(.dark [data-scope='toast'][data-part='description']) {
		color: var(--color-surface-200, #e2e8f0);
	}
	/* colored left border so success/error/warning read as typed cards */
	:global([data-scope='toast'][data-part='root'][data-type='success']) {
		border-inline-start: 3px solid var(--color-success-500);
	}
	:global([data-scope='toast'][data-part='root'][data-type='error']) {
		border-inline-start: 3px solid var(--color-error-500);
	}
	:global([data-scope='toast'][data-part='root'][data-type='warning']) {
		border-inline-start: 3px solid var(--color-warning-500);
	}
	/* neutralize the close button, Skeleton tints it by type by default */
	:global([data-scope='toast'][data-part='close-trigger']) {
		color: var(--color-surface-500) !important;
	}
</style>
