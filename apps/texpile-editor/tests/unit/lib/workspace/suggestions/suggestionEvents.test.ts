import { it, expect } from 'vitest';
import { buildAnchor } from '$lib/comments/anchor';
import { foldLog, openEvent } from '$lib/comments/log';
import { resolveExactly } from '$lib/comments/anchorSearch';
import { movedAnchorEvents } from '$lib/workspace/suggestions/suggestionEvents';

const figure = (w: string) => `\\begin{figure}[t]\n\\centering\n\\includegraphics[width=${w}\\textwidth]{plot}\n\\end{figure}\n\n`;

// the suggestion made the second figure read like the first; text added above both moved it
it('records a suggestion again when its old anchor would now find the other copy of its words', () => {
	const saved = 'Intro.\n\n' + figure('0.8') + 'The second run behaves the same way.\n\n' + figure('0.8') + 'End.\n';
	const at = saved.lastIndexOf('0.8');
	const thread = openEvent({
		id: 's',
		file: 'main.tex',
		by: 'mei',
		body: '',
		anchor: buildAnchor(saved, at, at + 3),
		at: 'then',
		restore: '0.5'
	});
	const added = 'A longer paragraph written later, before both figures, long enough to pass the first.\n\n'.repeat(2);
	const text = added + saved;
	const placed = [{ id: 's', from: added.length + at, to: added.length + at + 3, restore: '0.5', author: 'mei' }];

	const [moved] = movedAnchorEvents(text, placed, foldLog([thread]), 'louis');
	expect(moved?.t === 'anchor' && resolveExactly(text, moved.anchor)).toEqual({ from: placed[0].from, to: placed[0].to });
});
