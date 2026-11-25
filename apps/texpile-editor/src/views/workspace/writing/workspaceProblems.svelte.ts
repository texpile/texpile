// what the Problems tab reads from the workspace: the open file, its spelling and grammar, the main document
import { untrack } from 'svelte';
import type { DocumentBuffer } from '$lib/workspace/documentBuffer.svelte';
import { hasVisualMode } from '$lib/workspace/documentBuffer.svelte';
import { indexedText } from '$lib/files/index/indexedTexts';
import { activeCompare, detectedMainFile, fileTree, mainFile, workspaceRoot } from '$lib/workspace/workspaceStore';
import { editorConfigStore } from '$lib/stores/editorStore';
import { problemsOpenFile, setMainFileFromProblems } from '$lib/problems/problemsStore.svelte';
import { OpenFileProofread } from '$lib/problems/sources/openFileProofread.svelte';
import { proofreadProblems } from '$lib/problems/sources/proofreadProblems';
import { refreshMainCandidate, refreshMainDocument } from '$lib/problems/sources/mainDocument.svelte';

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
	const proofread = new OpenFileProofread(
		() => (doc.path && hasVisualMode(doc.kind) && !activeCompare.current ? { path: doc.path, text: doc.texSource } : null),
		proofreadProblems
	);
	$effect(() => {
		void doc.path;
		void doc.texSource;
		void activeCompare.current;
		void editorConfigStore.current?.spellcheck;
		untrack(() => proofread.schedule());
	});
	$effect(() => () => proofread.destroy());
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
