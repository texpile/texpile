// the files the main file brings in, and the file the Project banner offers as main when none is set
import { box } from '$lib/runes/box.svelte';
import { documentFiles, type Read } from '$lib/workspace/document/documentFiles';
import { hasDocumentEnv } from '$lib/workspace/latexRoundtrip';
import { samePath } from '$lib/workspace/fileSystem';

export type MainDocument = { main: string; files: string[] };

/** null with no main file set, or before it is read */
export const mainDocument = box<MainDocument | null>(null);

/** null when nothing in the folder is sure to start the open file's document */
export const mainCandidate = box<string | null>(null);

let documentSeq = 0;

export async function refreshMainDocument(main: string | null, root: string | null, read: Read): Promise<void> {
	const my = ++documentSeq;
	if (!main || !root || !/\.(tex|typ)$/i.test(main)) {
		mainDocument.current = null;
		return;
	}
	const files = await documentFiles(main, root, read).catch(() => null);
	if (my !== documentSeq) return;
	const paths = files?.flatMap((f) => (f.missing ? [] : [f.path])) ?? [main];
	const was = mainDocument.current;
	// unchanged files keep their object, so nothing downstream reads them again
	if (was && samePath(was.main, main) && was.files.length === paths.length && was.files.every((p, i) => p === paths[i])) return;
	mainDocument.current = { main, files: paths };
}

let candidateSeq = 0;

/** the detected main file when it brings the open file in, else the open file when it starts a document */
export async function refreshMainCandidate(open: string | null, detected: string | null, root: string | null, read: Read): Promise<void> {
	const my = ++candidateSeq;
	let found: string | null = null;
	if (open && root && /\.(tex|typ)$/i.test(open)) {
		const files = detected && !samePath(detected, open) ? await documentFiles(detected, root, read).catch(() => []) : [];
		if (files.some((f) => !f.missing && samePath(f.path, open))) found = detected;
		else if (/\.typ$/i.test(open) || hasDocumentEnv(await read(open).catch(() => ''))) found = open;
	}
	if (my === candidateSeq) mainCandidate.current = found;
}
