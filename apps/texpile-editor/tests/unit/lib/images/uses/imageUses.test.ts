import { describe, expect, it } from 'vitest';
import { pathInFolder } from '$lib/images/uses/imageUses';

describe('pathInFolder', () => {
	it('keeps a guest path whole, which is already the folder name', () => {
		expect(pathInFolder('images/sample.png', 'session')).toBe('images/sample.png');
		expect(pathInFolder('/home/me/paper/images/sample.png', '/home/me/paper')).toBe('images/sample.png');
	});
});
