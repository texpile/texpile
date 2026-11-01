import { collabHost } from '$lib/collab/hostStore.svelte';
import { changeTextNow } from '$lib/buffers/textNow';
import { basename, samePath } from '$lib/workspace/fileSystem';
import { documentMainFile } from '$lib/workspace/workspaceStore';
import { confirmAsk } from '$lib/modals/confirm.svelte';
import type { HostHistory } from '$lib/draw/editor/state/editorState.types';
import { takeFragmentNeeds, withLibrary, withPackage } from '$lib/draw/tikz/source/options/libraries';
import { stepTouches } from './stepPlace';
import { headWrite } from './headWrite';
import { m } from '$lib/paraglide/messages';

const JOIN_MS = 500;

type TextRange = { from: number; to: number };

function giveNeedsToMain(path: string, text: string): Promise<void> {
	const needs = takeFragmentNeeds(text);
	const main = documentMainFile();
	if (!needs || !main || samePath(main, path)) return Promise.resolve();
	return changeTextNow(main, (t) =>
		needs.libraries.reduce((at, library) => withLibrary(at, library).source, needs.packages.reduce(withPackage, t))
	);
}

// the canvas would show nothing happen, so the change is named first, as an undo of a reload from disk is
function askOutside(which: 'undo' | 'redo', file: string): Promise<boolean> {
	return which === 'undo'
		? confirmAsk(m.figure_undo_outside_title(), { detail: m.figure_undo_outside_body({ file }), confirmLabel: m.menubar_undo() })
		: confirmAsk(m.figure_redo_outside_title(), { detail: m.figure_redo_outside_body({ file }), confirmLabel: m.menubar_redo() });
}

export function figureWrites(
	path: () => string,
	picture: () => TextRange | null,
	pictureIn: (text: string) => number | null
): { write: (text: string) => void; history: HostHistory; needsWritten: () => Promise<void> } {
	let lastWrite = -Infinity;
	let needsWritten: Promise<void> = Promise.resolve();
	async function step(which: 'undo' | 'redo'): Promise<void> {
		const binding = collabHost.collabFor(path());
		const range = picture();
		if (!binding) return;
		if (range && stepTouches(binding.undo, which, binding.ytext, range) === false && !(await askOutside(which, basename(path())))) return;
		binding.undo[which]();
	}
	return {
		write(text) {
			const file = path();
			const now = collabHost.loadedText(file);
			if (now === text) return;
			if (performance.now() - lastWrite > JOIN_MS) collabHost.collabFor(file)?.undo.stopCapturing();
			lastWrite = performance.now();
			const range = picture();
			const nextFrom = pictureIn(text);
			const head = now !== null && range && nextFrom !== null ? headWrite(now, text, range.from, nextFrom) : null;
			// both in this task, so nothing reads the text between them
			if (head !== null) collabHost.edit(file, head);
			void changeTextNow(file, () => text);
			needsWritten = giveNeedsToMain(file, text);
		},
		history: { undo: () => void step('undo'), redo: () => void step('redo') },
		// a main file not open is written on disk, which the preamble is read from after
		needsWritten: () => needsWritten
	};
}
