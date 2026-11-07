// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { latexFace } from '$lib/languages/latex/visual/core/walk/drawUnits';

describe('spacing parts', () => {
	it('draws a backslash before a line end as the control space it is', () => {
		expect(latexFace('\\\n', false)).not.toBeNull();
		expect(latexFace('\\ ', false)).not.toBeNull();
	});
});
