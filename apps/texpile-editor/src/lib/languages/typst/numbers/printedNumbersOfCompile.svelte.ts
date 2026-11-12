// the Typst document's printed numbers, read again each time a compile of it ends
import { untrack } from 'svelte';
import { mainFile, workspaceRoot } from '$lib/workspace/workspaceStore';
import { documentFiles } from '$lib/workspace/document/documentFiles';
import { fileService } from '$lib/files/service/fileService';
import {
	forgetTypstPrintedNumbers,
	onTypstPrintedNumbersShown,
	setTypstPrintedNumbers,
	typstPrintedNumbersShown
} from '$lib/stores/typstPrintedNumbers';
import { readTypstPrintedNumbers } from './readPrintedNumbers';

function typstMain(): string | null {
	const main = mainFile.current;
	return main && /\.typ$/i.test(main) ? main : null;
}

// a document that does not compile leaves the numbers of its last compile showing
async function readNumbersOf(root: string, main: string): Promise<void> {
	const items = await readTypstPrintedNumbers(root, main);
	if (!items || workspaceRoot.current !== root || mainFile.current !== main) return;
	const files = await documentFiles(main, root, (p) => fileService.readText(p));
	if (workspaceRoot.current !== root || mainFile.current !== main) return;
	setTypstPrintedNumbers(
		main,
		files.map((f) => f.path),
		items
	);
}

/** for as long as the effect root it is called in; `runsFinished` counts the compiles that ended */
export function bindTypstPrintedNumbers(runsFinished: () => number, guest: () => boolean): void {
	let seenRuns = untrack(runsFinished);
	// a compile ended whose numbers no editor has asked for: reading them costs a compile inside tinymist
	let unread = false;
	let reading = false;
	let again = false;

	async function read(): Promise<void> {
		if (reading) {
			again = true;
			return;
		}
		reading = true;
		try {
			do {
				again = false;
				const root = workspaceRoot.current;
				const main = typstMain();
				if (root && main && !guest()) await readNumbersOf(root, main);
			} while (again);
		} finally {
			reading = false;
		}
	}

	function readWhenShown(): void {
		if (!unread || !typstPrintedNumbersShown()) return;
		unread = false;
		void read();
	}

	$effect(() => {
		const runs = runsFinished();
		if (runs === seenRuns) return;
		seenRuns = runs;
		unread = true;
		untrack(readWhenShown);
	});
	$effect(() => onTypstPrintedNumbersShown(readWhenShown));
	$effect(() => {
		const main = mainFile.current;
		if (!main) return;
		return () => forgetTypstPrintedNumbers(main);
	});
}
