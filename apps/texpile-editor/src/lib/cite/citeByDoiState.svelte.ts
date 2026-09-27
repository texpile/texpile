// Open/closed state for the Cite by DOI dialog, plus the insert context it will act on. A module
// singleton like the Zotero picker's: the dialog mounts once in WorkspaceView and any entry point
// (context menu, palette, Insert menu) opens it by setting this.
import type { CiteDeps } from './citeByDoi';

class CiteByDoiState {
	open = $state(false);
	/** where the eventual insert goes; captured when the dialog opens, cleared with it */
	deps = $state.raw<CiteDeps | null>(null);

	show(deps: CiteDeps): void {
		this.deps = deps;
		this.open = true;
	}

	hide(): void {
		this.open = false;
		this.deps = null;
	}
}

export const citeByDoi = new CiteByDoiState();
