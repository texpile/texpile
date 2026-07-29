// Window-level wiring for an open workspace: the listeners that keep our snapshots fresh, and
// the close handshake with the main process.
//
// The file tree is a SNAPSHOT, so it is rescanned on window focus and on the fs-changed event our
// own writes dispatch. Any on-disk change also rescans references, so \cite autocompletion and
// the citation nodes see fresh keys immediately.
import { native } from '$lib/workspace/fileSystem';

export interface WindowWiringDeps {
	refreshTree(): void;
	reloadReferences(): void;
	/** guests have no on-disk copy to diff against */
	isHost(): boolean;
	checkExternalChange(): void;
	runCompile(): void;
	onWindowResize(): void;
}

/** attach the workspace's window listeners; returns the detach function */
export function attachWindowListeners(deps: WindowWiringDeps): () => void {
	const onFocus = () => {
		deps.refreshTree();
		if (deps.isHost()) deps.checkExternalChange();
		deps.reloadReferences();
	};
	const onFsChanged = () => {
		deps.refreshTree();
		deps.reloadReferences();
	};
	const onCompile = () => deps.runCompile();
	const onResize = () => deps.onWindowResize();

	window.addEventListener('focus', onFocus);
	window.addEventListener('texpile:fs-changed', onFsChanged);
	window.addEventListener('compile', onCompile);
	window.addEventListener('resize', onResize);

	return () => {
		window.removeEventListener('focus', onFocus);
		window.removeEventListener('texpile:fs-changed', onFsChanged);
		window.removeEventListener('compile', onCompile);
		window.removeEventListener('resize', onResize);
	};
}

export interface CloseGuardDeps {
	/** a prompt is already up: its detached edit is invisible to the save pipeline */
	promptIsOpen(): boolean;
	/** nothing unsaved that needs asking about */
	canCloseSilently(): boolean;
	flushSaves(): Promise<void>;
	confirmLeaveUnsaved(): Promise<boolean>;
}

/** The window close is HELD by the main process until we answer (with a 2s backstop for a hung
 * renderer). Fast path: flush the autosave debounce and proceed. With autosave off and a pending
 * edit the modal can outlive the hold, so we release the close NOW and re-issue it after the
 * answer, at which point the pending edit is settled and the fast path applies. */
export function attachCloseGuard(deps: CloseGuardDeps): (() => void) | undefined {
	return native()?.onBeforeClose?.(async () => {
		if (deps.promptIsOpen()) {
			native()?.closeDecision?.(false);
			return;
		}
		if (deps.canCloseSilently()) {
			await deps.flushSaves();
			native()?.closeDecision?.(true);
			return;
		}
		native()?.closeDecision?.(false);
		if (await deps.confirmLeaveUnsaved()) {
			await deps.flushSaves();
			window.close();
		}
	});
}
