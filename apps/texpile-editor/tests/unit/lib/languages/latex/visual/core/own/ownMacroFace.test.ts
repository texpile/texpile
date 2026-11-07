// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { latexFace } from '$lib/languages/latex/visual/core/walk/drawUnits';
import { EMPTY_PROJECT_INTEL, projectIntelStore } from '$lib/stores/projectIntel';

afterEach(() => {
	projectIntelStore.current = EMPTY_PROJECT_INTEL;
});

describe('a macro a style file of the project defines', () => {
	it('draws an alias of a citation command as that citation', () => {
		const newcite = { name: 'newcite', signature: '', file: 'emnlp2020.sty', line: 1, definition: '\\citet', argCount: 0 };
		projectIntelStore.current = { ...EMPTY_PROJECT_INTEL, macros: [newcite] };
		const face = latexFace('\\newcite{cao}', false);
		expect(face?.dom.className).toBe('drawn-macro');
		expect(face?.dom.querySelector('.drawn-crossref')).not.toBeNull();
	});
});
