import { describe, expect, it } from 'vitest';
import { hasViewToggle } from '../../../../../src/views/workspace/pane/viewToggle';

describe('hasViewToggle', () => {
	it('offers the figure editor for a .tikz file to the host only', () => {
		expect(hasViewToggle('/p/fig.tikz', 'text', false)).toBe(true);
		expect(hasViewToggle('session/fig.tikz', 'text', true)).toBe(false);
	});
});
