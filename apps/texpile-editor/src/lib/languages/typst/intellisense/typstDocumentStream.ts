import { observe } from '$lib/runes/observe.svelte';
import { trailingDebounce } from '$lib/trailingDebounce';
import { streamTypstDocument, syncTypstDocuments } from './lspClient';

// long enough that a burst of typing is one compile, short enough that the preview reads as live.
// what needs the text exact (a preview scroll, a guest's request) syncs first on its own
const SYNC_DELAY_MS = 200;

export type TypstDocumentStreamHooks = {
	getRoot: () => string | null;
	/** reactive: the open .typ this editor owns; null for anything else, and always for a guest */
	getOpenTypstFile: () => string | null;
	/** reactive: that file's text, which the visual editor serializes into on every edit */
	getText: () => string;
};

type StreamedTypstDocument = { root: string | null; path: string | null; text: string };

/**
 * Keeps tinymist's copy of the host's open .typ equal to the editor buffer, so the live preview,
 * the diagnostics and a guest's intellisense follow the visual editor as they follow the source
 * one. Held in every mode, not just visual: the source editor's own plugin outranks it while
 * mounted, and a hold spanning the switch is what lets a mode change hand the document over
 * without closing it.
 */
export class TypstDocumentStream {
	private readonly syncSoon = trailingDebounce<void>(SYNC_DELAY_MS, () => syncTypstDocuments());
	private last: StreamedTypstDocument = { root: null, path: null, text: '' };
	private readonly stop: () => void;

	constructor(hooks: TypstDocumentStreamHooks) {
		this.stop = observe(
			() => {
				const path = hooks.getOpenTypstFile();
				return { root: hooks.getRoot(), path, text: path ? hooks.getText() : '' };
			},
			(next) => this.follow(next)
		);
	}

	/** leaving the workspace: the server goes back to reading the file */
	dispose(): void {
		this.stop();
		this.syncSoon.cancel();
		this.follow({ root: null, path: null, text: '' });
	}

	private follow(next: StreamedTypstDocument): void {
		const { root, path, text } = this.last;
		if (next.root === root && next.path === path && next.text === text) return;
		this.last = next;
		// only visual typing waits on this timer: opening and closing went out at once, and a
		// mounted source editor's plugin times its own syncs
		if (streamTypstDocument(next.root, next.path, next.text)) this.syncSoon();
	}
}
