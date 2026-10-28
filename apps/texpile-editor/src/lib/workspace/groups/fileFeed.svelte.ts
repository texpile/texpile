// Each file a parked editor shows, as it is now, whoever changed it: the focused editor, a collaborator or
// the disk. The text is the model's; the feed holds the visual document of it, which a parked visual editor
// takes by the smallest replace that turns its own into it. The focused editor's documents go across as they
// are, with no parse; text from anywhere else is parsed once for every editor that follows it
import { SvelteMap } from 'svelte/reactivity';
import type * as Y from 'yjs';
import { liveText, textVersion } from '$lib/buffers/liveText.svelte';
import type { Node as PMNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import type { SourceMap } from '$lib/editor/visual/sourceSpans';
import type { DocMeta } from '../documentBuffer.svelte';

/** a visual document of the file, the text it is of and where its runs sit in that text; `version` is the
 *  model's for that text, -1 when the model had moved on */
export type FileDoc = { text: string; version: number; doc: PMNode; map: SourceMap; meta: DocMeta };

export type FileNow = { text: string; visual: FileDoc | null };

/** text to a visual document, as the file was parsed; null when it cannot be parsed now */
export type FileParser = (path: string, text: string) => Promise<Omit<FileDoc, 'text' | 'version'> | null>;

const PARSE_AFTER_MS = 120;

const visuals = new SvelteMap<string, FileDoc>();
const followers = new Map<string, Set<(doc: PMNode) => void>>();
const parsing = new Map<string, ReturnType<typeof setTimeout>>();
let parser: FileParser | null = null;
let modelOf: ((path: string) => Y.Text | undefined) | null = null;

export function setFileParser(next: FileParser | null): void {
	parser = next;
}

/** where the feed finds each file's text: the model */
export function setFileTextSource(next: ((path: string) => Y.Text | undefined) | null): void {
	modelOf = next;
}

function textOf(path: string): string | undefined {
	const model = modelOf?.(path);
	return model && liveText(model);
}

function versionOf(path: string): number | undefined {
	const model = modelOf?.(path);
	return model && textVersion(model);
}

/** the file as it is now, or undefined while the model does not hold it */
export function fileNow(path: string): FileNow | undefined {
	const visual = visuals.get(path) ?? null;
	const text = textOf(path) ?? visual?.text;
	return text === undefined ? undefined : { text, visual };
}

/** the focused visual editor's document of `text` */
export function publishFile(path: string, text: string, doc: Omit<FileDoc, 'text' | 'version'>): void {
	if (visuals.get(path)?.doc === doc.doc) return;
	const visual = { text, version: textOf(path) === text ? (versionOf(path) ?? -1) : -1, ...doc };
	visuals.set(path, visual);
	for (const follow of followers.get(path) ?? []) follow(visual.doc);
}

/** the file's text moved: a parked visual editor gets a document of it */
export function fileChanged(path: string): void {
	scheduleParse(path);
}

function scheduleParse(path: string): void {
	if (!followers.get(path)?.size || visuals.get(path)?.version === versionOf(path)) return;
	clearTimeout(parsing.get(path));
	parsing.set(
		path,
		setTimeout(() => {
			parsing.delete(path);
			const text = textOf(path);
			const version = versionOf(path);
			if (text === undefined || !parser) return;
			void parser(path, text).then((parsed) => {
				// a newer text started its own parse
				if (!parsed || versionOf(path) !== version) return;
				publishFile(path, text, parsed);
			});
		}, PARSE_AFTER_MS)
	);
}

/** a file renamed or moved: what the feed has of it goes along */
export function moveFile(from: string, to: string): void {
	const had = visuals.get(from);
	if (!had || from === to) return;
	visuals.delete(from);
	visuals.set(to, had);
}

/** the files no parked editor shows any more */
export function forgetFilesBut(keep: Set<string>): void {
	for (const path of [...visuals.keys()]) if (!keep.has(path)) visuals.delete(path);
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
	const visual = visuals.get(path);
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
