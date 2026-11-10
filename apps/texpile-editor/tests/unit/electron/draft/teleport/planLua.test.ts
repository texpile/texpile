import { it, expect } from 'vitest';
import { planLua } from '../../../../../../../electron/src/draft/teleport/planLua';

const serve = { src: '_draft/p1/tele/s1', cut: '_draft/p1/tele/cut-1' };

// the plan goes to the engine as one stdin line, the edited text inside it; `\9` then `1` read back as `[`
it('writes the edited text on one line, each control character in three digits', () => {
	const plan = planLua(
		{ start: 0, chain: [], stops: [] },
		new Map([['main.tex', { text: 'a\t1\r\n2\n' }]]),
		'main.tex',
		{ from: 1, oldTo: 1, newTo: 2 },
		1,
		['main.tex'],
		serve
	);
	expect(plan).not.toMatch(/[\r\n]/);
	expect(plan).toContain('["main.tex"]={text="a\\0091\\013\\0102\\010"}');
});
