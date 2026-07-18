<script module lang="ts">
	// per page-load, not per mount: survives in-app navigation, resets on a real reload
	let reopenAttempted = false;
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { navigate } from '$lib/router.svelte';
	import { FolderOpen, FolderPlus, GraduationCap, Loader2 } from '@lucide/svelte';
	// dark wordmark for light backgrounds, white one for dark mode
	import logoOnLight from '$lib/assets/logo/Logo-dark.svg';
	import logoOnDark from '$lib/assets/logo/Logo-light.svg';
	import { pickFolder, scanTexFiles, statFile, writeTextFile, joinPath, basename, type TexFile } from '$lib/workspace/fileSystem';
	import { createStarterLatex } from '$lib/workspace/latexRoundtrip';
	import {
		workspaceRoot,
		texFiles,
		recentFolders,
		addRecentFolder,
		activeFilePath,
		setMainFile,
		savedLastFile
	} from '$lib/workspace/workspaceStore';
	import { getSettings, updateSettings } from '$lib/settings';
	import StarterPicker from '$lib/editor/comp/StarterPicker.svelte';
	import TutorialConfirmModal from '$lib/editor/comp/TutorialConfirmModal.svelte';
	import { applyStarter, applyImportedFiles, openTutorialProject, type Starter, type ImportedFile } from '$lib/workspace/starters';

	let busy = $state(false);
	let error = $state<string | null>(null);
	let templateFor = $state<string | null>(null); // an empty folder awaiting a starter-template choice
	let tutorialModalOpen = $state(false);

	async function finishOpen(root: string, active: string | null) {
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

	async function applyTemplate(s: Starter) {
		const root = templateFor;
		if (!root || busy) return;
		busy = true;
		try {
			const mainPath = await applyStarter(root, s);
			setMainFile(root, mainPath);
			await finishOpen(root, mainPath);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to create from template';
		} finally {
			busy = false;
		}
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
			error = e instanceof Error ? e.message : 'Failed to open the tutorial';
		} finally {
			busy = false;
		}
	}

	async function importOwn(files: ImportedFile[]) {
		const root = templateFor;
		if (!root || busy) return;
		busy = true;
		try {
			const mainPath = await applyImportedFiles(root, files);
			if (mainPath) setMainFile(root, mainPath);
			await finishOpen(root, mainPath);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to import the files';
		} finally {
			busy = false;
		}
	}

	async function openBlank() {
		const root = templateFor;
		if (!root || busy) return;
		busy = true;
		try {
			const mainPath = joinPath(root, 'main.tex');
			await writeTextFile(mainPath, createStarterLatex());
			await finishOpen(root, mainPath);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to create project';
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
			const { files } = await scanTexFiles(root);
			workspaceRoot.set(root);
			texFiles.set(files);
			activeFilePath.set(await initialFile(root, files));
			addRecentFolder(root);
			updateSettings({ lastFolder: root });
			navigate('/workspace');
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to open folder';
		} finally {
			busy = false;
		}
	}

	async function createNewProject() {
		error = null;
		templateFor = null;
		const root = await pickFolder();
		if (!root) return;
		busy = true;
		try {
			const { files } = await scanTexFiles(root);
			if (files.length === 0) {
				// let the user pick a starter (or a blank file) before opening
				templateFor = root;
				return;
			}
			workspaceRoot.set(root);
			texFiles.set(files);
			activeFilePath.set(await initialFile(root, files));
			addRecentFolder(root);
			updateSettings({ lastFolder: root });
			navigate('/workspace');
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to create project';
		} finally {
			busy = false;
		}
	}

	// reopen the last folder once per page-load (module-level flag, not sessionStorage:
	// that persists across reloads and blocked reopen in dev)
	onMount(async () => {
		if (reopenAttempted) return;
		reopenAttempted = true;
		const s = await getSettings();
		if (!s.reopenLastFolder || !s.lastFolder) return;
		try {
			const { files } = await scanTexFiles(s.lastFolder);
			workspaceRoot.set(s.lastFolder);
			texFiles.set(files);
			activeFilePath.set(await initialFile(s.lastFolder, files));
			addRecentFolder(s.lastFolder);
			navigate('/workspace');
		} catch {
			// last folder is gone or unreadable, stay on the start screen
		}
	});
</script>

<svelte:head><title>Texpile</title></svelte:head>

<div class="grid min-h-screen place-items-center px-6 py-12">
	<div
		class="border-surface-200-800 bg-surface-50-950 rounded-container w-full border p-7 shadow-sm {templateFor ? 'max-w-2xl' : 'max-w-sm'}"
	>
		<img src={logoOnLight} alt="Texpile" class="mx-auto mb-7 h-9 w-auto dark:hidden" />
		<img src={logoOnDark} alt="Texpile" class="mx-auto mb-7 hidden h-9 w-auto dark:block" />

		{#if templateFor}
			<div class="mb-3 flex items-baseline justify-between gap-2">
				<h2 class="text-surface-500 text-xs font-semibold tracking-wider uppercase">New project</h2>
				<span class="text-surface-400 truncate text-xs" title={templateFor}>{basename(templateFor)}</span>
			</div>
			<StarterPicker onPick={applyTemplate} onBlank={openBlank} onImport={importOwn} {busy} />
			<button
				class="text-surface-500 hover:text-surface-950-50 mt-4 text-sm disabled:opacity-50"
				onclick={() => (templateFor = null)}
				disabled={busy}
			>
				Back
			</button>
			{#if error}
				<p class="text-error-500 mt-2 text-sm">{error}</p>
			{/if}
		{:else}
			<h2 class="text-surface-500 mb-2 text-xs font-semibold tracking-wider uppercase">Start</h2>
			<div class="flex flex-col gap-2">
				<button class="btn preset-filled-primary-500 w-full" onclick={() => openFolder()} disabled={busy}>
					{#if busy}<Loader2 class="size-4 animate-spin" />{:else}<FolderOpen class="size-4" />{/if}
					Open folder
				</button>
				<button class="btn preset-outlined-primary-500 w-full" onclick={createNewProject} disabled={busy}>
					<FolderPlus class="size-4" />
					Create new project
				</button>
			</div>

			<button
				class="text-surface-500 hover:text-surface-950-50 mt-3 inline-flex items-center gap-1.5 text-sm disabled:opacity-50"
				onclick={() => (tutorialModalOpen = true)}
				disabled={busy}
			>
				<GraduationCap class="size-4" /> New here? Try the tutorial
			</button>

			{#if error}
				<p class="text-error-500 mt-2 px-2 text-sm">{error}</p>
			{/if}

			{#if $recentFolders.length > 0}
				<h2 class="text-surface-500 mt-6 mb-1.5 text-xs font-semibold tracking-wider uppercase">Recent</h2>
				<ul class="space-y-1.5">
					{#each $recentFolders as folder (folder)}
						<li>
							<button
								class="group flex w-full items-baseline gap-2 text-left disabled:opacity-60"
								onclick={() => openFolder(folder)}
								disabled={busy}
								title={folder}
							>
								<span class="text-blue shrink-0 text-sm group-hover:underline">{basename(folder)}</span>
								<span class="text-surface-400 truncate text-xs group-hover:underline">{folder}</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
	</div>
</div>

<TutorialConfirmModal bind:open={tutorialModalOpen} onConfirm={openTutorial} />
