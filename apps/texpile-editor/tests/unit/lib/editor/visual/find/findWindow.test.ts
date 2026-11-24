import { expect, it } from 'vitest';
import { matchesIn } from '$lib/editor/visual/find/findWindow';
import type { FindMatch } from '$lib/editor/visual/find/findMatches';

// a one-letter query in a 1.9 MB paper tinted 50,000 matches, 600 ms a keystroke to build
it('tints the matches around the pane and the current one', () => {
	const matches: FindMatch[] = Array.from({ length: 1000 }, (_, i) => ({ kind: 'text', from: i * 10, to: i * 10 + 2 }));
	const shown = matchesIn(matches, { from: 495, to: 530 }, matches[900]);
	expect(shown.map((m) => m.from)).toEqual([500, 510, 520, 9000]);
});
