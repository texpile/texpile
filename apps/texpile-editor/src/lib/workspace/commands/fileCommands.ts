import { isDirty, activeFilePath, workspaceRoot } from '$lib/workspace/workspaceStore';
import { nativeBridge } from '$lib/workspace/fileSystem';
import { githubStatus, signInToGithub, signOutOfGithub } from '$lib/workspace/scm/remote/githubSignIn.svelte';
import { canKeepLocalHistory } from '$lib/workspace/localHistory/localHistory.svelte';
import { openLocalHistory, openRestoreDeleted } from '$lib/workspace/localHistory/localHistoryDialog.svelte';
import { confirmAsk } from '$lib/modals/confirm.svelte';
import { collabHost } from '$lib/collab/hostStore.svelte';
import type { CommandImpl } from '$lib/keybindings/commands/commandRegistry';
import type { PaletteActions } from '$lib/workspace/commandPalette.svelte';
import { m } from '$lib/paraglide/messages';

// Full renderer reload, VS Code's "Reload Window": the recovery move when something is stuck. Through the main process,
// not location.reload(): the workspace root is memory-only, so a bare reload forgets the folder and lands on Start
async function reloadWorkspace(): Promise<void> {
	// hosting outranks a dirty buffer: the reload drops every guest (session keys are memory-only), and that is the
	// surprise worth one dialog. Never both dialogs
	if (collabHost.active) {
		if (!(await confirmAsk(m.palette_reload_sharing_confirm(), { danger: true }))) return;
	} else if (isDirty.current && !(await confirmAsk(m.palette_reload_unsaved_confirm(), { danger: true }))) return;
	nativeBridge()?.reloadWorkspace?.();
}

export function fileCommands(a: PaletteActions): CommandImpl[] {
	function host(): boolean {
		return a.isHostWorkspace();
	}
	// the compile target decides the document rows, exactly as in the File > New menus: .typ for a Typst project, .tex
	// otherwise; .bib and markdown serve both
	function newFile(ext: string, when: () => boolean = () => true): CommandImpl {
		return { id: `file.new${ext[0].toUpperCase()}${ext.slice(1)}`, enabled: () => a.canManageTree() && when(), run: () => a.newFile(ext) };
	}
	return [
		{ id: 'file.save', enabled: () => a.hasFile(), run: () => a.save() },
		{ id: 'typst.export', enabled: () => !!a.canExportTypst?.(), run: () => a.exportTypst?.() },
		newFile('typ', () => a.isTypstProject()),
		{ id: 'typst.preview', enabled: () => a.canManageTree() && a.isTypstProject() && host(), run: () => a.openTypstPreview() },
		newFile('tex', () => !a.isTypstProject()),
		newFile('bib'),
		newFile('md'),
		{ id: 'file.saveAsTemplate', enabled: () => !!a.saveAsTemplate, run: () => a.saveAsTemplate?.() },
		{ id: 'file.openFolder', enabled: host, run: () => a.openFolder() },
		{ id: 'file.clone', enabled: () => host() && !!a.cloneRepository, run: () => a.cloneRepository?.() },
		// VS Code's Accounts menu, for GitHub: sign in in the browser, or out
		{
			id: 'file.githubAccount',
			enabled: () => host() && githubStatus.current.available,
			title: () =>
				githubStatus.current.login ? m.palette_github_sign_out({ login: githubStatus.current.login }) : m.palette_github_sign_in(),
			run: () => void (githubStatus.current.login ? signOutOfGithub() : signInToGithub())
		},
		// Local History: the open file's copies, and the way back to a deleted file's (the File menu's two)
		{
			id: 'file.localHistory',
			enabled: () => host() && canKeepLocalHistory() && !!activeFilePath.current,
			run: () => activeFilePath.current && openLocalHistory(activeFilePath.current)
		},
		// a lone file's folder is not this window's to search for lost files
		{
			id: 'file.restoreDeleted',
			enabled: () => host() && a.isProject() && canKeepLocalHistory() && !!workspaceRoot.current,
			run: () => workspaceRoot.current && openRestoreDeleted(workspaceRoot.current)
		},
		{ id: 'file.forgetSignIns', enabled: () => host() && !!a.forgetSignIns, run: () => a.forgetSignIns?.() },
		{ id: 'file.refreshTree', run: () => a.refreshTree() },
		// hosts only: a guest's workspace is the live session, and reloading is just disconnecting
		{ id: 'window.reload', enabled: () => host() && !!nativeBridge()?.reloadWorkspace, run: reloadWorkspace },
		{ id: 'window.devtools', enabled: () => !!nativeBridge()?.toggleDevTools, run: () => nativeBridge()?.toggleDevTools?.() },
		{ id: 'file.preferences', run: () => a.openPreferences() },
		// the other half of the app-icon menu, so everything in there is reachable from here too
		{ id: 'file.shareSession', enabled: () => !!a.openShareSession, run: () => a.openShareSession?.() }
	];
}
