<script lang="ts">
	// Every modal the workspace can raise, in one place. These are all independent of each other
	// and of the layout; keeping them here stops WorkspaceView's markup from being half dialogs.
	import MainFileModal from './MainFileModal.svelte';
	import CompileCommandModal from './CompileCommandModal.svelte';
	import FormatModal from './FormatModal.svelte';
	import CommandPalette from '$lib/palette/CommandPalette.svelte';
	import { promptAsk } from '$lib/modals/confirm.svelte';
	import { basename } from '$lib/workspace/fileSystem';
	import type { RefUpdate } from '$lib/workspace/refUpdate';
	import { m } from '$lib/paraglide/messages';
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
		onRunCompile: () => void;
		onFormat: () => void;
		onResolveConflict: (choice: 'reload' | 'keep') => void;
		onKeepRefs: () => void;
		onApplyRefs: () => void;
	} = $props();

	// The forced-choice prompts are message boxes (confirm.svelte.ts): the OS draws them on the
	// desktop, ConfirmHost on the web. Each fires once per state object; a stale answer (the state
	// moved on while the box was up) is dropped rather than resolving the newer one.

	// autosave off, switching away from a file with unsaved edits. Three answers, so the X /
	// Escape / backdrop CANCEL the switch rather than saving it.
	let askedUnsaved: object | null = null;
	$effect(() => {
		const p = unsaved.prompt;
		if (!p || p === askedUnsaved) return;
		askedUnsaved = p;
		void promptAsk({
			title: m.wsview_unsaved_title(),
			message: m.wsview_confirm_save_before_switch({ name: p.name }),
			buttons: [
				{ id: 'save', label: m.wsview_save_label(), primary: true },
				{ id: 'discard', label: m.vcs_discard_changes() },
				{ id: 'cancel', label: m.wsview_cancel_label() }
			],
			cancelId: 'cancel'
		}).then((id) => {
			if (unsaved.prompt === p) unsaved.resolve(id === 'save' || id === 'discard' ? id : 'cancel');
		});
	});

	// the file changed on disk while we held unsaved edits: no dismissing, one of the two
	let askedConflict: object | null = null;
	$effect(() => {
		const c = external.conflict;
		if (!c || c === askedConflict) return;
		askedConflict = c;
		void promptAsk({
			title: m.wsview_conflict_title(),
			message: `${basename(c.path)} ${m.wsview_conflict_body()}`,
			buttons: [
				{ id: 'keep', label: m.wsview_keep_my_version(), primary: true },
				{ id: 'reload', label: m.wsview_reload_from_disk() }
			]
		}).then((id) => {
			if (external.conflict === c) onResolveConflict(id === 'reload' ? 'reload' : 'keep');
		});
	});

	// after a rename or move, offer to repoint the references we found; dismissing keeps them
	let askedRefs: object | null = null;
	$effect(() => {
		const u = pendingRefUpdate;
		if (!u || u === askedRefs) return;
		askedRefs = u;
		void promptAsk({
			title: m.wsview_refupdate_title(),
			message: refUpdateBody(u),
			buttons: [
				{ id: 'apply', label: m.wsview_refupdate_apply(), primary: true },
				{ id: 'keep', label: m.wsview_refupdate_keep() }
			],
			cancelId: 'keep'
		}).then((id) => {
			if (pendingRefUpdate === u) (id === 'apply' ? onApplyRefs : onKeepRefs)();
		});
	});

	// total refs and file count pluralize independently
	function refUpdateBody(u: RefUpdate): string {
		const refClause =
			u.total === 1 ? m.wsview_refupdate_ref_count_one({ count: u.total }) : m.wsview_refupdate_ref_count_other({ count: u.total });
		const fileClause =
			u.hits.length === 1
				? m.wsview_refupdate_file_count_one({ count: u.hits.length })
				: m.wsview_refupdate_file_count_other({ count: u.hits.length });
		const args = { refClause, fileClause, oldRel: u.oldRel, newRel: u.newRel };
		return u.total === 1 ? m.wsview_refupdate_body_one(args) : m.wsview_refupdate_body_other(args);
	}
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
	onRun={onRunCompile}
/>

<FormatModal bind:open={formatModalOpen} {formatting} tool={formatTool} {onFormat} />

<!-- takes no props: it reads the action registry WorkspaceView fills in, and owns its own Ctrl+K -->
<CommandPalette />
