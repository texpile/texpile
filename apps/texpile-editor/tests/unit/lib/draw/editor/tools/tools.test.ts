import { describe, expect, it } from 'vitest';
import type { FigureFeature, FigureLanguage } from '$lib/draw/editor/figure/figureLanguage';
import { railTools } from '$lib/draw/editor/tools/tools';

const languageWith = (features: FigureFeature[]) => ({ features }) as unknown as FigureLanguage;

describe('railTools', () => {
	it('leaves out what the language does not back, and the divider before it', () => {
		const ids = railTools(languageWith([])).map((t) => t?.id ?? '|');
		expect(ids).not.toContain('dimension');
		expect(ids).not.toContain('trim');
		expect(ids.at(-1)).not.toBe('|');
		expect(ids.join(' ')).not.toContain('| |');
	});

	it('keeps every tool for a language that backs them all', () => {
		const ids = railTools(languageWith(['dimensions', 'trim'])).map((t) => t?.id);
		expect(ids).toContain('dimension');
		expect(ids).toContain('trim');
	});
});
