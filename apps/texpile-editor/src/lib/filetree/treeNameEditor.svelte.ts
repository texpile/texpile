// The inline name inputs: creating a file/folder/include and renaming an entry. Blur is not
// consent - an untouched field losing focus dismisses rather than accepts the pre-fill.
import type { TreeEntry } from '$lib/workspace/fileSystem';
import { parentOf } from './treePaths';

type EditorHooks = {
	rootPath: () => string;
	expand: (dir: string) => void;
	onCreate: (parentDir: string, name: string, type: 'file' | 'dir' | 'include') => void;
	onRename: (entry: TreeEntry, newName: string) => void;
	/** is this name already used in that folder? renaming an entry passes its own path so a
	 *  recase does not collide with itself */
	nameTaken: (dir: string, name: string, selfPath?: string | null) => boolean;
	/** the message shown for a name that is taken */
	takenMessage: (name: string) => string;
	/** what a New Include will actually be called once its extension is appended */
	includeName: (name: string) => string;
};

export class TreeNameEditor {
	creatingIn = $state<string | null>(null);
	createType = $state<'file' | 'dir' | 'include'>('file');
	createValue = $state('');
	createEdited = $state(false); // did the user actually type, or is this still our pre-fill?
	renaming = $state<string | null>(null);
	renameValue = $state('');
	renameEdited = $state(false);

	constructor(private hooks: EditorHooks) {}

	// A name that is taken is refused in the input rather than after the fact: the file system
	// would reject it too, but only once the operation had already been asked for. Getters, not
	// $derived: a field initializer runs before the constructor assigns `hooks`.
	get createError(): string | null {
		// an include gets its extension appended, so "intro" is checked as intro.tex
		const name = this.createType === 'include' ? this.hooks.includeName(this.createValue.trim()) : this.createValue;
		if (this.creatingIn === null || !this.hooks.nameTaken(this.creatingIn, name)) return null;
		return this.hooks.takenMessage(name.trim());
	}

	get renameError(): string | null {
		if (!this.renaming || !this.hooks.nameTaken(parentOf(this.renaming), this.renameValue, this.renaming)) return null;
		return this.hooks.takenMessage(this.renameValue.trim());
	}

	startCreate(dir: string, type: 'file' | 'dir' | 'include', defaultName = ''): void {
		this.creatingIn = dir;
		this.createType = type;
		this.createValue = defaultName;
		this.createEdited = false;
		if (dir !== this.hooks.rootPath()) this.hooks.expand(dir);
	}

	commitCreate(): void {
		if (this.createError) return; // stay open on the taken name so it can be edited
		const v = this.createValue.trim();
		const dir = this.creatingIn;
		this.creatingIn = null;
		this.createValue = '';
		if (v && dir !== null) this.hooks.onCreate(dir, v, this.createType);
	}

	// decided a frame late, because the menu/focusSelect handoff blurs it spuriously first
	blurCreate(e: FocusEvent): void {
		// blurring away from a name that cannot be used abandons it rather than leaving the input
		// stranded open with nothing focused
		if (this.createError) {
			this.cancelCreate();
			return;
		}
		if (this.createEdited) {
			this.commitCreate();
			return;
		}
		const input = e.currentTarget as HTMLElement;
		requestAnimationFrame(() => {
			if (this.creatingIn !== null && document.activeElement !== input) this.cancelCreate();
		});
	}

	cancelCreate(): void {
		this.creatingIn = null;
		this.createValue = '';
	}

	startRename(e: TreeEntry): void {
		this.renaming = e.path;
		this.renameValue = e.name;
		this.renameEdited = false;
	}

	commitRename(e: TreeEntry): void {
		if (this.renaming !== e.path) return; // guard against Enter + blur double-firing
		if (this.renameError) return; // stay open on the taken name so it can be edited
		this.renaming = null;
		const v = this.renameValue.trim();
		if (v && v !== e.name) this.hooks.onRename(e, v);
	}

	/** same deferred-dismiss reasoning as blurCreate. */
	blurRename(e: FocusEvent, entry: TreeEntry): void {
		if (this.renameError) {
			this.renaming = null;
			return;
		}
		if (this.renameEdited) {
			this.commitRename(entry);
			return;
		}
		const input = e.currentTarget as HTMLElement;
		requestAnimationFrame(() => {
			if (this.renaming === entry.path && document.activeElement !== input) this.renaming = null;
		});
	}
}
