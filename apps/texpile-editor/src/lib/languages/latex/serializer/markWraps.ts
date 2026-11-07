import type { Mark } from 'prosemirror-model';
import { markSaves } from '../visual/core/plugin/documentMap';
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
