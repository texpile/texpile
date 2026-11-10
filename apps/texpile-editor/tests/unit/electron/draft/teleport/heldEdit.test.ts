import { it, expect } from 'vitest';
import { paragraphOpen } from '../../../../../../../electron/src/draft/teleport/heldEdit';
import { lineEdit } from '../../../../../../../electron/src/draft/teleport/lineEdit';

const before = ['First paragraph.', '', 'Costs \\verb|$| each.', '', 'Last paragraph.'];

function held(after: string[]): boolean {
	return paragraphOpen(before, after, lineEdit(before, after)!);
}

it('holds a keystroke that leaves a brace open', () => {
	expect(held(['First \\textbf{par', '', ...before.slice(2)])).toBe(true);
});

// an IEEEtran \author{...} holds a blank line: every edit after it read the closing brace as one too many
it('shows a word typed in the second paragraph of a brace group', () => {
	const group = ['{\\small para one', '', 'para two}'];
	const after = ['{\\small para one', '', 'para two more}'];
	expect(paragraphOpen(group, after, lineEdit(group, after)!)).toBe(false);
});

// an agent's write spans every paragraph between its hunks, one of them misread as open math
it('shows a write across a paragraph the count misreads', () => {
	expect(held(['First paragraph, changed.', '', 'Costs \\verb|$| each.', '', 'Last paragraph, changed.'])).toBe(false);
});
