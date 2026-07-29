// Populating an empty folder: applying a built-in starter template, or importing files the user
// dropped in. Both write into the workspace root, set the resulting main file, and reload
// references (a starter or an import may carry a .bib whose \cite keys must resolve immediately).
import { get } from 'svelte/store';
import { workspaceRoot, activeFilePath, fileTree, setMainFile } from '$lib/workspace/workspaceStore';
import { applyStarter, applyImportedFiles, type Starter, type ImportedFile } from '$lib/workspace/starters';
import { freeName } from '$lib/workspace/fileSystem';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';

const NEW_FILE_NAMES: Record<string, string> = {
	tex: 'untitled.tex',
	bib: 'references.bib',
	cls: 'untitled.cls',
	sty: 'mystyle.sty'
};

export interface StarterDeps {
	loadRefs(root: string): Promise<unknown> | void;
	refreshTree(): Promise<void>;
	createEntry(root: string, name: string, type: 'file' | 'dir'): Promise<unknown>;
}

export class StarterActions {
	/** true while a starter/import is being written; blocks a second concurrent run */
	applying = $state(false);

	constructor(private deps: StarterDeps) {}

	private async run(work: (root: string) => Promise<string | null>): Promise<void> {
		const root = get(workspaceRoot);
		if (!root || this.applying) return;
		this.applying = true;
		try {
			const mainPath = await work(root);
			await this.deps.loadRefs(root);
			await this.deps.refreshTree();
			if (mainPath) {
				setMainFile(root, mainPath);
				activeFilePath.set(mainPath);
			}
		} finally {
			this.applying = false;
		}
	}

	async pick(s: Starter): Promise<void> {
		try {
			await this.run(async (root) => {
				const mainPath = await applyStarter(root, s);
				setMainFile(root, mainPath); // before the refresh, so the star badge lands with the tree
				return mainPath;
			});
		} catch (e) {
			toaster.error({ title: m.wsview_toast_starter_create_failed_title(), description: e instanceof Error ? e.message : String(e) });
		}
	}

	async importFiles(files: ImportedFile[]): Promise<void> {
		try {
			await this.run((root) => applyImportedFiles(root, files));
		} catch (e) {
			toaster.error({ title: m.wsview_toast_import_failed_title(), description: e instanceof Error ? e.message : String(e) });
		}
	}

	/** the pre-filled name for the tree's inline create input, deduped against the root */
	newFileName(ext?: string): string {
		if (!ext) return '';
		const rootNames = get(fileTree).map((e) => e.name);
		return freeName(NEW_FILE_NAMES[ext] ?? `untitled.${ext}`, rootNames);
	}

	/** the "blank document" starter: just create main.tex at the root */
	async newTexFile(): Promise<void> {
		const root = get(workspaceRoot);
		if (!root) return;
		await this.deps.createEntry(
			root,
			freeName(
				'main.tex',
				get(fileTree).map((e) => e.name)
			),
			'file'
		);
	}
}
