import { describe, expect, it } from 'vitest';
import { gridLook } from '$lib/editor/visual/extensions/table/canvas/tableLooks';

describe('gridLook', () => {
	it('starts a table of its own in the text at the left, as the DOM editor did', () => {
		const look = gridLook(null, 'left', false);
		expect(look.marginLeft).toBeUndefined();
		expect(look.marginRight).toBeUndefined();
	});

	it('stands a table as wide as its cells on the side its holder gives', () => {
		expect(gridLook(null, 'center', true)).toMatchObject({ marginLeft: 'auto', marginRight: 'auto', width: 'auto' });
		const right = gridLook(null, 'right', false);
		expect(right.marginLeft).toBe('auto');
		expect(right.marginRight).toBeUndefined();
	});
});
