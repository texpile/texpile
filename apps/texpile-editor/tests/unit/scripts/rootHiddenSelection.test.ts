import { it, expect } from 'vitest';
import { noRootHiddenSelection } from '../../../scripts/rootHiddenSelection';

it('drops the rule that hides the selection from the page down, and keeps the caret rule', () => {
	const removed: string[] = [];
	for (const selector of [
		'.ProseMirror-hideselection *::selection',
		'.ProseMirror-hideselection *::-moz-selection',
		'.ProseMirror-hideselection'
	])
		noRootHiddenSelection.Rule({ selector, remove: () => removed.push(selector) });
	expect(removed).toEqual(['.ProseMirror-hideselection *::selection', '.ProseMirror-hideselection *::-moz-selection']);
});
