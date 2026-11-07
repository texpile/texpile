// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { typstCommentFace } from '$lib/languages/typst/visual/core/code/typstCommentFace';

describe('typstCommentFace', () => {
	it('folds line and block comments, nested ones included', () => {
		expect(typstCommentFace('// one\n// two\n// three')?.dom.textContent).toBe('// one+2 lines');
		expect(typstCommentFace('/* outer /* inner */ still */')?.dom.textContent).toBe('/* outer /* inner */ still');
		expect(typstCommentFace('/*\n * a note\n */')?.line).toBe(true);
	});

	it('leaves anything that is not only comments as source', () => {
		expect(typstCommentFace('#set text(size: 11pt) // a note')).toBeNull();
		expect(typstCommentFace('/* never closed')).toBeNull();
	});
});
