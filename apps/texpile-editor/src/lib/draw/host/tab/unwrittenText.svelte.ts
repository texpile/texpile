// a canvas drag writes its text once, on release; live mode shows each step before that
import { untrack } from 'svelte';
import type { FigureEditorState } from '$lib/draw/editor';

type UnwrittenListener = (path: string, text: string) => void;

const listeners = new Set<UnwrittenListener>();

export function showUnwrittenText(path: string, text: string): void {
	for (const listener of listeners) listener(path, text);
}

export function onUnwrittenText(listener: UnwrittenListener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

/** each step of a drag goes to live mode, and its end sends the text as written: the release's or, cancelled, the old */
export function followUnwritten(path: () => string, editor: () => FigureEditorState | null): void {
	let following = false;
	$effect(() => {
		const ed = editor();
		const text = ed?.unwritten ?? null;
		if (!ed || (text === null && !following)) return;
		following = text !== null;
		showUnwrittenText(untrack(path), text ?? untrack(() => ed.text));
	});
}
