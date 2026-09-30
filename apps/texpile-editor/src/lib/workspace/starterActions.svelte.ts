// Populating an empty folder: applying a built-in starter, a template the user saved, or one from
// Typst Universe, or importing files the user dropped in. All write into the workspace root, set
// the resulting main file, and reload references (a starter or an import may carry a .bib whose
// \cite keys must resolve immediately).
import { workspaceRoot, openFile, fileTree, setMainFile } from '$lib/workspace/workspaceStore';
import { applyStarter, applyImportedFiles, type ImportedFile } from '$lib/workspace/starters';
import { freeName } from '$lib/workspace/fileSystem';
import { requireTemplatesBridge } from '$lib/workspace/templates/templateBridge';
import { createFromUniverse, TinymistMissingError, toastTinymistMissing } from '$lib/workspace/templates/universe/universeProject';
import { CloneCancelledError, createFromRemote } from '$lib/workspace/templates/saved/remoteTemplate';
import type { StarterChoice } from '$lib/workspace/templates/starterChoice';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';

const NEW_FILE_NAMES: Record<string, string> = {
	tex: 'untitled.tex',
	typ: 'untitled.typ',
	bib: 'references.bib',
	md: 'untitled.md',
	cls: 'untitled.cls',
	sty: 'mystyle.sty'
};

/** write the chosen starter into root; resolves to its main file, null when a clone brought none */
function createFrom(root: string, choice: StarterChoice): Promise<string | null> {
	switch (choice.kind) {
		case 'bundled':
			return applyStarter(root, choice.starter);
		case 'saved': {
			const { remote } = choice.template;
			return remote ? createFromRemote(root, { ...choice.template, remote }) : requireTemplatesBridge().apply(choice.template.id, root);
		}
		case 'universe':
			return createFromUniverse(root, choice.template);
	}
}

export type StarterDeps = {
	loadRefs(root: string): Promise<unknown> | void;
	refreshTree(): Promise<void>;
	createEntry(root: string, name: string, type: 'file' | 'dir'): Promise<unknown>;
};

export class StarterActions {
	/** true while a starter/import is being written; blocks a second concurrent run */
	applying = $state(false);

	constructor(private deps: StarterDeps) {}

	private async runStarterAction(work: (root: string) => Promise<string | null>): Promise<void> {
		const root = workspaceRoot.current;
		if (!root || this.applying) return;
		this.applying = true;
		try {
			const mainPath = await work(root);
			// a download can outlast the folder it was started in
			if (workspaceRoot.current !== root) return;
			await this.deps.loadRefs(root);
			await this.deps.refreshTree();
			if (mainPath) {
				setMainFile(root, mainPath);
				openFile(mainPath);
			}
		} finally {
			this.applying = false;
		}
	}

	async pick(choice: StarterChoice): Promise<void> {
		// a Universe template or a clone is a download, often a few seconds: say so while it runs
		const title =
			choice.kind === 'universe'
				? m.gallery_downloading({ name: choice.template.name })
				: choice.kind === 'saved' && choice.template.remote
					? m.template_cloning({ name: choice.template.name })
					: null;
		const downloading = title ? toaster.create({ type: 'loading', title, duration: Infinity }) : null;
		try {
			await this.runStarterAction(async (root) => {
				const mainPath = await createFrom(root, choice);
				if (mainPath && workspaceRoot.current === root) setMainFile(root, mainPath); // before the refresh, so the star badge lands with the tree
				return mainPath;
			});
		} catch (e) {
			if (e instanceof CloneCancelledError) return;
			if (e instanceof TinymistMissingError) return void toastTinymistMissing();
			toaster.error({ title: m.wsview_toast_starter_create_failed_title(), description: e instanceof Error ? e.message : String(e) });
		} finally {
			if (downloading) toaster.dismiss(downloading);
		}
	}

	async importFiles(files: ImportedFile[]): Promise<void> {
		try {
			await this.runStarterAction((root) => applyImportedFiles(root, files));
		} catch (e) {
			toaster.error({ title: m.wsview_toast_import_failed_title(), description: e instanceof Error ? e.message : String(e) });
		}
	}

	/** the pre-filled name for the tree's inline create input, deduped against the root */
	newFileName(ext?: string): string {
		if (!ext) return '';
		const rootNames = fileTree.current.map((e) => e.name);
		return freeName(NEW_FILE_NAMES[ext] ?? `untitled.${ext}`, rootNames);
	}

	/** the "blank document" starter: just create main.tex at the root */
	async newTexFile(): Promise<void> {
		const root = workspaceRoot.current;
		if (!root) return;
		await this.deps.createEntry(
			root,
			freeName(
				'main.tex',
				fileTree.current.map((e) => e.name)
			),
			'file'
		);
	}
}
