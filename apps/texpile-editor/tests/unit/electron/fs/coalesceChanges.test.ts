import { describe, expect, it } from 'vitest';
import { coalesceChanges } from '../../../../../../electron/src/fs/coalesceChanges';

describe('coalesceChanges', () => {
	it('folds one batch the way vscode does', () => {
		expect(
			coalesceChanges([
				{ type: 'added', path: '/p/tmp.tex' },
				{ type: 'deleted', path: '/p/tmp.tex' },
				{ type: 'deleted', path: '/p/main.tex' },
				{ type: 'added', path: '/p/main.tex' },
				{ type: 'added', path: '/p/new.tex' },
				{ type: 'updated', path: '/p/new.tex' },
				{ type: 'deleted', path: '/p/figs/a.png' },
				{ type: 'deleted', path: '/p/figs' }
			])
		).toEqual([
			{ type: 'deleted', path: '/p/figs' },
			{ type: 'updated', path: '/p/main.tex' },
			{ type: 'added', path: '/p/new.tex' }
		]);
	});
});
