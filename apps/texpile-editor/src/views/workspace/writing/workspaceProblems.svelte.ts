// what the Problems tab reads from the workspace: the open file, its spelling and grammar, the main document
import { untrack } from 'svelte';
import type { DocumentBuffer } from '$lib/workspace/documentBuffer.svelte';
import { hasVisualMode } from '$lib/workspace/documentBuffer.svelte';
import { indexedText } from '$lib/files/index/indexedTexts';
import { activeCompare, detectedMainFile, fileTree, mainFile, workspaceRoot } from '$lib/workspace/workspaceStore';
import { editorConfigStore } from '$lib/stores/editorStore';
import { problemsOpenFile, setMainFileFromProblems } from '$lib/problems/problemsStore.svelte';
import { OpenFileChecks } from '$lib/problems/sources/openFileChecks.svelte';
import { openFileRows } from '$lib/problems/sources/openFileRows';
import { mainDocument, refreshMainCandidate, refreshMainDocument } from '$lib/problems/sources/mainDocument.svelte';
import { ProjectChecks } from '$lib/problems/sources/projectChecks.svelte';
import { references } from '$lib/workspace/citations';
import { fileService } from '$lib/files/service/fileService';

/** for as long as the effect root it is called in */
export function bindProblems(doc: DocumentBuffer, setMain: (file: string) => Promise<void>): void {
	function read(p: string): Promise<string> {
		return indexedText(p);
	}
	$effect(() => {
		problemsOpenFile.current = activeCompare.current ? null : doc.path;
		return () => (problemsOpenFile.current = null);
	});
	$effect(() => {
		setMainFileFromProblems.current = setMain;
		return () => (setMainFileFromProblems.current = null);
	});
	const own = new OpenFileChecks(
		() => (doc.path && hasVisualMode(doc.kind) && !activeCompare.current ? { path: doc.path, text: doc.texSource } : null),
		openFileRows
	);
	$effect(() => {
		void doc.path;
		void doc.texSource;
		void activeCompare.current;
		void editorConfigStore.current?.spellcheck;
		untrack(() => own.schedule());
	});
	$effect(() => () => own.destroy());
	const project = new ProjectChecks({
		document: () => mainDocument.current,
		open: () => problemsOpenFile.current,
		root: () => workspaceRoot.current,
		read,
		knownKeys: () => new Set(references.current.map((r) => r.key))
	});
	$effect(() => {
		void mainDocument.current;
		void problemsOpenFile.current;
		void doc.texSource;
		void references.current;
		void editorConfigStore.current?.spellcheck;
		untrack(() => project.schedule());
	});
	$effect(() => {
		const offOperations = fileService.onDidRunOperation(() => project.schedule());
		const offChanges = fileService.onDidFilesChange(() => project.schedule());
		return () => {
			offOperations();
			offChanges();
		};
	});
	$effect(() => () => project.destroy());
	$effect(() => {
		const main = mainFile.current;
		const root = workspaceRoot.current;
		void fileTree.current;
		untrack(() => void refreshMainDocument(main, root, read));
	});
	$effect(() => {
		const open = problemsOpenFile.current;
		const detected = detectedMainFile.current;
		const root = workspaceRoot.current;
		void fileTree.current;
		untrack(() => void refreshMainCandidate(open, detected, root, read));
	});
}
