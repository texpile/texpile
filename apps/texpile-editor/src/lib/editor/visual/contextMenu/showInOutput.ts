// the visual editor's Show in PDF: a position of the document jumps the output there
import { offsetAtPm } from '$lib/editor/visual/sourceMap';
import type { SourceMap } from '$lib/editor/visual/sourceSpans';
import { lineOf } from '$lib/comments/anchorLocate';

export type ShowInOutput = { label: string; run: (pos: number) => void };

/** `sync` takes a 1-based line of `text`, as the source editor's menu hands it */
export function showInOutputAt(label: string, map: SourceMap, text: string, sync: (line: number) => void): ShowInOutput {
	return {
		label,
		run: (pos) => {
			const at = offsetAtPm(map, pos) ?? offsetAtPm(map, pos, 1);
			if (at !== null) sync(lineOf(text, Math.min(at, text.length)));
		}
	};
}
