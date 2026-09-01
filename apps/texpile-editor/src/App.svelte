<script lang="ts">
	import { onMount } from 'svelte';
	import { navigate, route } from '$lib/router.svelte';
	import { nativeBridge, openNewWindow } from '$lib/workspace/fileSystem';
	import { openFileInWindow, openFolderInWindow } from '$lib/workspace/openWorkspace';
	import { settings, loadSettings } from '$lib/settings';
	import { checkForUpdate, updateModalOpen } from '$lib/updates';
	import UpdateAvailableModal from '$lib/modals/window/UpdateAvailableModal.svelte';
	import WhatsNewModal from '$lib/modals/window/WhatsNewModal.svelte';
	import { entriesToShow, whatsNewOpen } from '$lib/whatsNew';
	import { codeFromJoinLink, nameFromJoinLink, pendingJoinCode, pendingJoinName } from '$lib/collab/joinLink.svelte';

	// every released CHANGELOG.md entry, injected at build (vite.config)
	const whatsNew = __WHATS_NEW__;
	// the panel is opened from Help / the start screen, never thrown at you on launch
	const whatsNewEntries = $derived(entriesToShow(whatsNew, settings.current.whatsNewSeen));

	import StartView from './views/StartView.svelte';
	import ErrorView from './views/ErrorView.svelte';
	import WorkspaceSkeleton from '$lib/chrome/WorkspaceSkeleton.svelte';

	// route-split: StartView stays static (first paint), the editor views load on demand so the
	// boot chunk stays small
	let WorkspaceView = $state<typeof import('./views/workspace/WorkspaceView.svelte').default | null>(null);
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
	function loadWorkspace() {
		return (workspaceLoad ??= retryImport(() => import('./views/workspace/WorkspaceView.svelte')).then((mod) => {
			if (mod) WorkspaceView = mod.default;
			else workspaceLoad = null;
		}));
	}
	function loadSession() {
		return (sessionLoad ??= retryImport(() => import('./views/SessionRoute.svelte')).then((mod) => {
			if (mod) SessionRoute = mod.default;
			else sessionLoad = null;
		}));
	}

	// covers reloads landing straight on a hash and any navigate() we didn't preload for
	$effect(() => {
		if (__WEB__)
			loadSession(); // the browser build has one route
		else if (route.path === '/workspace') loadWorkspace();
		else if (route.path === '/session') loadSession();
	});

	// not during the launch itself: this is a DNS lookup, a TLS handshake and an HTTP round trip,
	// and nothing about it is worth putting in front of the document opening
	onMount(() => {
		if (__WEB__) return; // a web page updates by reloading; there is no installer to offer
		const t = setTimeout(async () => {
			const s = await loadSettings();
			// once per app SESSION, not per window: without this every new window would re-check
			// for updates (claim falls back to true in browser dev)
			const primary = (await nativeBridge()?.claimStartupTasks?.()) ?? true;
			if (!primary || !s.checkForUpdates) return;
			// a failed silent check stays silent; the manual Help-menu check surfaces errors
			if ((await checkForUpdate()) === 'update') updateModalOpen.current = true;
		}, 3000);
		return () => clearTimeout(t);
	});

	// a texpile://join#CODE link the OS handed over. The renderer pulls the code out, so main can
	// stay ignorant of the code format.
	onMount(() => {
		const n = nativeBridge();
		if (!n?.onJoinSession) return;
		return n.onJoinSession((url) => {
			const code = codeFromJoinLink(url);
			if (!code) return;
			pendingJoinCode.current = code;
			const name = nameFromJoinLink(url);
			if (name) pendingJoinName.current = name;
			loadSession();
			navigate('/session');
		});
	});

	// OS "Open With" hands us a .tex via the main process; open its folder and activate the file.
	// A folder handed over at LAUNCH never comes through here: preload answers it synchronously and
	// src/main.ts adopts it before the first render (see openWorkspace).
	onMount(() => {
		const n = nativeBridge();
		if (!n?.onOpenPath) return;
		return n.onOpenPath((filePath) => {
			loadWorkspace(); // stream the workspace chunk while the folder scans
			void openFileInWindow(filePath);
		});
	});

	// "Open Folder in New Window" and the palette's workspace reload push a folder at a window that
	// is already running (the StartView-side auto-reopen is gone; it would misfire in new windows)
	onMount(() => {
		const n = nativeBridge();
		if (!n?.onOpenFolder) return;
		return n.onOpenFolder((root) => {
			loadWorkspace(); // stream the workspace chunk while the folder scans
			void openFolderInWindow(root);
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

{#if __WEB__}
	<!-- the browser build is the join client and nothing else: no start screen, no local folder -->
	{#if SessionRoute}<SessionRoute />{:else if chunkError}<ErrorView status={500} />{/if}
{:else if route.path === '/'}
	<StartView />
{:else if route.path === '/workspace'}
	{#if WorkspaceView}<WorkspaceView />{:else if chunkError}<ErrorView status={500} />{:else}<WorkspaceSkeleton />{/if}
{:else if route.path === '/session'}
	{#if SessionRoute}<SessionRoute />{:else if chunkError}<ErrorView status={500} />{/if}
{:else}
	<ErrorView status={404} />
{/if}

{#if whatsNewEntries.length}
	<WhatsNewModal bind:open={whatsNewOpen.current} entries={whatsNewEntries} />
{/if}
<UpdateAvailableModal />

<style>
	/*
	 * Layout: a two-column grid, not Skeleton's flex row.
	 *
	 * Its row is `message | action | close` with the message on `flex: 1`, inside a 24rem card with
	 * 12px padding. A nowrap action button ("Check toolchain") and the close button take ~160px of
	 * that between them, leaving the text under 190px - so any description longer than a few words
	 * ragged-wrapped into a tall narrow column beside a button twice its width.
	 *
	 * The grid gives the message the full width (less the close button, which belongs in the corner
	 * regardless) and drops the action onto its own row beneath it. Toasts WITHOUT an action - very
	 * nearly all of them - keep exactly the shape they had, because the second row simply is not
	 * created. align-items:start rather than center, so the close button stays at the top corner of a
	 * message that runs to three lines instead of floating at its middle.
	 */
	:global([data-scope='toast'][data-part='root']) {
		display: grid;
		grid-template-columns: 1fr auto;
		align-items: start;
	}
	:global([data-scope='toast'][data-part='message']) {
		grid-column: 1;
		min-width: 0; /* a long path or command must wrap, not widen the card past its max */
	}
	:global([data-scope='toast'][data-part='close-trigger']) {
		grid-column: 2;
		grid-row: 1;
	}
	/* its own row, right-aligned under the close button: the action is a decision about the whole
	   message, so it reads better after it than wedged into the middle of it */
	:global([data-scope='toast'][data-part='action-trigger']) {
		grid-column: 1 / -1;
		justify-self: end;
	}

	/*
	 * Toasts default to transparent, so give them a solid surface.
	 *
	 * [data-type] carries no meaning here beyond WEIGHT: Skeleton paints success/warning/error toasts
	 * in solid `--color-{type}-500` from a three-attribute selector, which outranked a two-attribute
	 * one. Only the .dark override happened to beat it, so the same error toast was a neutral card in
	 * dark mode and a wall of red in light. Matching its specificity settles it in both.
	 */
	:global([data-scope='toast'][data-part='root'][data-type]) {
		background-color: var(--color-surface-50, #ffffff);
		border: 1px solid var(--color-surface-300, #cbd5e1);
		color: var(--color-surface-950, #0b1220);
		box-shadow: 0 10px 30px rgb(0 0 0 / 0.22);
	}
	/* deliberately NOT also carrying [data-type]: it already outweighs Skeleton at this weight, and a
	   fourth token would have outranked the accent-border rules below and swallowed the colored edge */
	:global(.dark [data-scope='toast'][data-part='root']) {
		background-color: var(--color-surface-950, #0b1220);
		border-color: var(--color-surface-700, #334155);
		color: var(--color-surface-50, #f8fafc);
	}
	/* explicit text colors, the defaults were too low-contrast on the surface */
	:global([data-scope='toast'][data-part='title']) {
		color: var(--color-surface-950, #0b1220);
		font-weight: 600;
	}
	:global([data-scope='toast'][data-part='description']) {
		color: var(--color-surface-700, #334155);
		overflow-wrap: anywhere; /* a path or command in the text must not widen the card */
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
