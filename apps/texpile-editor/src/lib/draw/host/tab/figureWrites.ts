import { collabHost } from '$lib/collab/hostStore.svelte';
import { changeTextNow } from '$lib/buffers/textNow';
import { samePath } from '$lib/workspace/fileSystem';
import { documentMainFile } from '$lib/workspace/workspaceStore';
import type { HostHistory } from '$lib/draw/editor/state/editorState.types';
import { takeFragmentNeeds, withLibrary, withPackage } from '$lib/draw/tikz/source/options/libraries';

// canvas edits closer than this are one undo step, as Yjs joins typing
const JOIN_MS = 500;

/** a fragment's edit that needs a package or a library puts it in the main file's preamble */
function giveNeedsToMain(path: string, text: string): void {
	const needs = takeFragmentNeeds(text);
	const main = documentMainFile();
	if (!needs || !main || samePath(main, path)) return;
	void changeTextNow(main, (t) =>
		needs.libraries.reduce((at, library) => withLibrary(at, library).source, needs.packages.reduce(withPackage, t))
	);
}

/** the figure writes into the file as typing does, and undoes through the file's one history */
export function figureWrites(path: () => string): { write: (text: string) => void; history: HostHistory } {
	let lastWrite = -Infinity;
	return {
		write(text) {
			if (collabHost.loadedText(path()) === text) return;
			// a canvas edit is its own step, apart from the typing before it
			if (performance.now() - lastWrite > JOIN_MS) collabHost.collabFor(path())?.undo.stopCapturing();
			lastWrite = performance.now();
			void changeTextNow(path(), () => text);
			giveNeedsToMain(path(), text);
		},
		history: {
			undo: () => void collabHost.collabFor(path())?.undo.undo(),
			redo: () => void collabHost.collabFor(path())?.undo.redo()
		}
	};
}
