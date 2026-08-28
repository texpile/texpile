<script lang="ts">
	// Every modal the workspace can raise, in one place. These are all independent of each other
	// and of the layout; keeping them here stops WorkspaceView's markup from being half dialogs.
	import MainFileModal from './MainFileModal.svelte';
	import CompileCommandModal from './CompileCommandModal.svelte';
	import FormatModal from './FormatModal.svelte';
	import ConflictModal from './ConflictModal.svelte';
	import SaveBeforeSwitchModal from './SaveBeforeSwitchModal.svelte';
	import RefUpdateModal, { type RefUpdate } from './RefUpdateModal.svelte';
	import CommandPalette from '$lib/palette/CommandPalette.svelte';
	import type { MainFilePrompt } from '$lib/workspace/mainFilePrompt.svelte';
	import type { UnsavedGuard } from '$lib/workspace/unsavedGuard.svelte';
	import type { ExternalChangeWatcher } from '$lib/workspace/externalChange.svelte';
	import type { CompileSettings } from '$lib/workspace/compileSettings.svelte';

	let {
		mainPrompt = $bindable(),
		unsaved,
		external,
		compileSettings = $bindable(),
		formatModalOpen = $bindable(),
		formatTool,
		formatting,
		pendingRefUpdate,
		onSaveCompile,
		onUseDefaultCompile,
		onRunCompile,
		onFormat,
		onResolveConflict,
		onKeepRefs,
		onApplyRefs
	}: {
		mainPrompt: MainFilePrompt;
		unsaved: UnsavedGuard;
		external: ExternalChangeWatcher;
		compileSettings: CompileSettings;
		formatModalOpen: boolean;
		/** which formatter Format will run for the open file */
		formatTool: 'latexindent' | 'typstyle';
		formatting: boolean;
		pendingRefUpdate: RefUpdate | null;
		onSaveCompile: (thenRun: boolean) => void;
		onUseDefaultCompile: () => void;
		onRunCompile: () => void;
		onFormat: () => void;
		onResolveConflict: (choice: 'reload' | 'keep') => void;
		onKeepRefs: () => void;
		onApplyRefs: () => void;
	} = $props();
</script>

{#if mainPrompt.open}
	<MainFileModal
		candidates={mainPrompt.candidates}
		tooMany={mainPrompt.tooMany}
		bind:choice={mainPrompt.choice}
		detected={mainPrompt.detected}
		docRoots={mainPrompt.docRoots}
		onConfirm={() => mainPrompt.confirm()}
		onDismiss={() => mainPrompt.dismiss()}
	/>
{/if}

<CompileCommandModal
	bind:open={compileSettings.modalOpen}
	bind:command={compileSettings.draft}
	bind:outputs={compileSettings.outputsDraft}
	bind:advancedOpen={compileSettings.advancedOpen}
	onSave={onSaveCompile}
	onUseDefault={onUseDefaultCompile}
	onRun={onRunCompile}
/>

<FormatModal bind:open={formatModalOpen} {formatting} tool={formatTool} {onFormat} />

<!-- file edited on disk while we held unsaved edits -->
{#if external.conflict}
	<ConflictModal path={external.conflict.path} onResolve={onResolveConflict} />
{/if}

<!-- autosave off, switching away from a file with unsaved edits -->
{#if unsaved.prompt}
	<SaveBeforeSwitchModal name={unsaved.prompt.name} onResolve={(c) => unsaved.resolve(c)} />
{/if}

{#if pendingRefUpdate}
	<RefUpdateModal update={pendingRefUpdate} onKeep={onKeepRefs} onApply={onApplyRefs} />
{/if}

<!-- takes no props: it reads the action registry WorkspaceView fills in, and owns its own Ctrl+K -->
<CommandPalette />
