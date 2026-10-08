// Each file a parked editor shows, as it is now, whoever changed it: the focused editor, a collaborator or
// the disk. A parked editor draws its file from here, and its visual editor takes each new document by the
// smallest replace that turns its own into it. The focused editor's documents go across as they are, with
// no parse; text from anywhere else is parsed once for every editor that follows it
import { SvelteMap } from 'svelte/reactivity';
import type { Node as PMNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import type { SourceMap } from '$lib/editor/visual/sourceSpans';
import type { DocMeta } from '../documentBuffer.svelte';

/** a visual document of the file, the text it is of and where its runs sit in that text */
export type FileDoc = { text: string; doc: PMNode; map: SourceMap; meta: DocMeta };

export type FileNow = { text: string; visual: FileDoc | null };

/** text to a visual document, as the file was parsed; null when it cannot be parsed now */
export type FileParser = (path: string, text: string) => Promise<Omit<FileDoc, 'text'> | null>;

const PARSE_AFTER_MS = 120;

const files = new SvelteMap<string, FileNow>();
const followers = new Map<string, Set<(doc: PMNode) => void>>();
const parsing = new Map<string, ReturnType<typeof setTimeout>>();
let parser: FileParser | null = null;

export function setFileParser(next: FileParser | null): void {
	parser = next;
}

/** the file as it is now, or undefined while nothing has told the feed */
export function fileNow(path: string): FileNow | undefined {
	return files.get(path);
}

/** `doc` when the text comes with its document, from the focused visual editor */
export function publishFile(path: string, text: string, doc?: Omit<FileDoc, 'text'>): void {
	const had = files.get(path);
	if (doc) {
		if (had?.visual?.doc === doc.doc) return;
		const visual = { text, ...doc };
		files.set(path, { text, visual });
		for (const follow of followers.get(path) ?? []) follow(visual.doc);
		return;
	}
	if (had?.text === text) return;
	files.set(path, { text, visual: had?.visual ?? null });
	scheduleParse(path);
}

function scheduleParse(path: string): void {
	if (!followers.get(path)?.size || files.get(path)?.visual?.text === files.get(path)?.text) return;
	clearTimeout(parsing.get(path));
	parsing.set(
		path,
		setTimeout(() => {
			parsing.delete(path);
			const text = files.get(path)?.text;
			if (text === undefined || !parser) return;
			void parser(path, text).then((parsed) => {
				// a newer text started its own parse
				if (!parsed || files.get(path)?.text !== text) return;
				publishFile(path, text, parsed);
			});
		}, PARSE_AFTER_MS)
	);
}

/** a file renamed or moved: what the feed has of it goes along */
export function moveFile(from: string, to: string): void {
	const had = files.get(from);
	if (!had || from === to) return;
	files.delete(from);
	files.set(to, had);
}

/** the files no parked editor shows any more */
export function forgetFilesBut(keep: Set<string>): void {
	for (const path of [...files.keys()]) if (!keep.has(path)) files.delete(path);
}

/** keeps `view` up with `path`; returns the unsubscribe */
export function followFile(path: string, view: () => EditorView | null): () => void {
	function follow(doc: PMNode): void {
		const v = view();
		if (v && !v.isDestroyed) patchToDoc(v, doc);
	}
	const set = followers.get(path) ?? new Set();
	set.add(follow);
	followers.set(path, set);
	const visual = files.get(path)?.visual;
	if (visual) follow(visual.doc);
	scheduleParse(path);
	return () => {
		set.delete(follow);
		if (set.size === 0) followers.delete(path);
	};
}

/** marked as a collaborator's patch, so the editor does not send it back to the buffer as its own edit */
export function patchToDoc(view: EditorView, next: PMNode): void {
	const current = view.state.doc;
	const start = current.content.findDiffStart(next.content);
	if (start == null) return;
	const end = current.content.findDiffEnd(next.content);
	if (!end) return;
	let { a: endA, b: endB } = end;
	// a change inside a run of equal characters finds its end before its start
	const overlap = start - Math.min(endA, endB);
	if (overlap > 0) {
		endA += overlap;
		endB += overlap;
	}
	view.dispatch(
		view.state.tr.replace(start, endA, next.slice(start, endB)).setMeta('collabRemotePatch', true).setMeta('addToHistory', false)
	);
}
