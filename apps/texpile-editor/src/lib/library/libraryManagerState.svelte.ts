// Open/closed state for the library manager dialog. A module singleton like the command
// palette's: the dialog mounts once in WorkspaceView and any entry point (palette, picker
// dialog) opens it by setting this.
class LibraryManagerState {
	open = $state(false);

	show(): void {
		this.open = true;
	}

	hide(): void {
		this.open = false;
	}
}

export const libraryManager = new LibraryManagerState();
