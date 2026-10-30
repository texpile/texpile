import { describe, expect, it } from 'vitest';
import { groupDepthsAt } from '$lib/languages/latex/intellisense/packages/groupDepth';

describe('groupDepthsAt', () => {
	it('reads past an environment that \\iffalse skips', () => {
		const text = '\\iffalse\\begin{draft}\\fi\n\\usepackage{a}';
		expect(groupDepthsAt(text, [text.indexOf('\\usepackage')])).toEqual([0]);
	});
});
