// the marks written around a run: each mark's open and close, inner to outer
import type { Mark } from 'prosemirror-model';
import { markSaves } from '../visual/core/plugin/documentMap';
/** Wrap `result` in each mark's open/close pair, inner to outer. shared with non-text leaves
 * that carry marks (an unknown macro chip under \textbf has no text node to carry the bold). */
export function applyMarks(text: string, marks: readonly Mark[]): string {
	let result = text;
	for (const mark of marks) {
		const make = markSaves.get(mark.type.name);
		if (!make) continue;
		const { open, close, inner } = make(mark.attrs ?? {}, result);
		result = open + (inner ?? result) + close;
	}
	return result;
}
