// Open/closed state for the insert-from-library picker dialog, plus the insert context it will
// act on. Same shape as the Zotero picker's state: the dialog mounts once in WorkspaceView and
// any entry point (context menu, palette) opens it by setting this.
import type { CitationInsertDeps } from '$lib/workspace/insertBibliography';

class LibraryPickerState {
	open = $state(false);
	/** where the eventual insert goes; captured when the dialog opens, cleared with it */
	deps = $state.raw<CitationInsertDeps | null>(null);

	show(deps: CitationInsertDeps): void {
		this.deps = deps;
		this.open = true;
	}

	hide(): void {
		this.open = false;
		this.deps = null;
	}
}

export const libraryPicker = new LibraryPickerState();
