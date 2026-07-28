// The "which file is the main document?" prompt.
//
// A multi-file project has to be told which .tex is the compile root. We ask ONCE, with the
// detected file preselected, and confirming persists it exactly like the file tree's
// "Set as main file" (star badge included).
//
// `confirmed` is deliberately tri-state: null means unresolved for the current folder. The modal
// never auto-opens on null, so it cannot flash while initProject is still scanning. Storage is
// consulted SYNCHRONOUSLY on folder open (resolve()), so a folder with a saved choice is already
// confirmed before the first render.
import { get } from 'svelte/store';
import { workspaceRoot, texFiles, mainFile, savedMainFile, setMainFile } from '$lib/workspace/workspaceStore';
import { detectMainFile, findDocRoots, gatherProjectMacros } from '$lib/workspace/project';
import { samePath, type TexFile } from '$lib/workspace/fileSystem';
import { settings } from '$lib/settings';

export interface MainFileDeps {
	/** the compile pipeline picks up the PDF that matches the newly chosen main file */
	loadExistingPdf(): void;
	/** macros gathered from the main file feed the parser and autocomplete */
	setProjectMacros(macros: string): void;
	/** live mode holds its first compile until a main file exists; release it */
	releaseHeldDraftCompile(): void;
}

export class MainFilePrompt {
	confirmed = $state<boolean | null>(null);
	open = $state(false);
	choice = $state<string | null>(null);
	detected = $state<string | null>(null);
	docRoots = $state<Set<string>>(new Set());
	private then: (() => void) | null = null;

	constructor(private deps: MainFileDeps) {}

	/** stable order: detected first, then document roots, then the rest. Frozen at open time so
	 * picking a different radio does not reshuffle the list under the pointer. */
	candidates = $derived.by(() => {
		const score = (f: TexFile) => (this.detected && samePath(f.path, this.detected) ? 0 : this.docRoots.has(f.path) ? 1 : 2);
		return [...get(texFiles)].sort((a, b) => score(a) - score(b) || a.relPath.localeCompare(b.relPath));
	});

	/** synchronous storage check on folder open */
	resolve(root: string | null) {
		this.confirmed = root ? (savedMainFile(root) ? true : null) : null;
	}

	async prompt(then?: () => void): Promise<void> {
		const root = get(workspaceRoot);
		if (!root || this.open) return;
		this.open = true;
		this.then = then ?? null;
		const files = get(texFiles);
		this.detected = get(mainFile) ?? (await detectMainFile(files));
		this.choice = this.detected;
		this.docRoots = await findDocRoots(files);
	}

	async confirm(): Promise<void> {
		await this.settle(this.choice);
	}

	/** closing the prompt still settles it: persist the pre-selected (detected) file so it does not
	 * return on every open. Nothing is locked in; the main file can be changed anytime via the tree. */
	async dismiss(): Promise<void> {
		await this.settle(this.choice ?? this.detected);
	}

	private async settle(chosen: string | null): Promise<void> {
		const root = get(workspaceRoot);
		if (!root || !chosen) {
			this.finish();
			return;
		}
		setMainFile(root, chosen);
		this.deps.loadExistingPdf();
		this.finish();
		this.deps.setProjectMacros(await gatherProjectMacros(chosen, root));
	}

	private finish() {
		this.open = false;
		this.confirmed = true;
		if (get(settings).draftMode) this.deps.releaseHeldDraftCompile();
		const k = this.then;
		this.then = null;
		k?.();
	}
}
