// prosemirror-view 1.42.9's clipboard parser: its index.js exports it, its .d.ts leaves it out
import type { ResolvedPos, Slice } from 'prosemirror-model';
import * as prosemirrorView from 'prosemirror-view';
import type { EditorView } from 'prosemirror-view';

type ClipboardSliceParser = (
	view: EditorView,
	text: string,
	html: string | null,
	plainText: boolean,
	$context: ResolvedPos
) => Slice | null;

/** clipboard or drop text and HTML as a slice for `$context`: the clipboard props, `data-pm-slice` and plain text rules */
export const parseFromClipboard = (prosemirrorView as unknown as { __parseFromClipboard: ClipboardSliceParser }).__parseFromClipboard;
