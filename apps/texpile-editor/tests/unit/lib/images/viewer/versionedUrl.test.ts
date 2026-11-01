import { describe, expect, it } from 'vitest';
import { versionedUrl } from '$lib/images/viewer/versionedUrl';

describe('versionedUrl', () => {
	it('leaves a guest blob url as it is, since a query breaks it', () => {
		expect(versionedUrl('blob:http://127.0.0.1:5173/1f2e', 3)).toBe('blob:http://127.0.0.1:5173/1f2e');
		expect(versionedUrl('texfile:///p/a.png?x=1', 3)).toBe('texfile:///p/a.png?x=1&v=3');
	});
});
