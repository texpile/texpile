import * as Y from 'yjs';
import { splice } from '$lib/collab/localFork';
import { spliceDiff } from '$lib/collab/spliceDiff';

/** the open file's text in the model, and how an edit goes into it */
export type DocumentText = { readonly text: Y.Text; write(content: string, before?: string): void };

/** a text no buffer holds: a read-only file, or a comparison against a deleted one */
export function standaloneText(initial: string): DocumentText {
	const text = new Y.Doc().getText('text');
	text.insert(0, initial);
	return {
		text,
		write: (content) => {
			const change = spliceDiff(text.toString(), content);
			if (change) text.doc!.transact(() => splice(text, change));
		}
	};
}
