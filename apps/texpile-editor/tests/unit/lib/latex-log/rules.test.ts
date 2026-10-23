import { expect, it } from 'vitest';
import { enrichLogEntries } from '../../../../src/lib/languages/latex/log/rules';

it('names the engine the compile ran in an unknown graphics extension hint', () => {
	const [entry] = enrichLogEntries([{ level: 'error', message: 'LaTeX Error: Unknown graphics extension: .svg.', raw: '' }], 'xelatex');
	expect(entry.ruleId).toBe('unknown-graphics-extension');
	expect(entry.hint).toContain('xelatex accepts');
});
