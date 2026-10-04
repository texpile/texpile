// An image already inside the folder is referenced where it is, so picking one does not leave two
// identical files with a generated name on the copy.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { relativeInside } from '$lib/workspace/fileSystem';

const platform = vi.hoisted(() => ({ isMac: false, isWindows: false }));
vi.mock('$lib/platform', () => platform);
afterEach(() => {
	platform.isWindows = false;
});

describe('relativeInside', () => {
	it('writes a path under the root relative, with forward slashes', () => {
		expect(relativeInside('C:\\ws\\paper', 'C:\\ws\\paper\\figures\\a.png')).toBe('figures/a.png');
		expect(relativeInside('/home/l/paper', '/home/l/paper/a.png')).toBe('a.png');
	});

	it('ignores separator style and case, as Windows hands both back', () => {
		platform.isWindows = true;
		expect(relativeInside('C:/ws/Paper', 'c:\\WS\\paper\\a.png')).toBe('a.png');
	});

	it('is null for anything outside, including a sibling with the same prefix', () => {
		expect(relativeInside('/home/l/paper', '/home/l/other/a.png')).toBeNull();
		expect(relativeInside('/home/l/paper', '/home/l/paper2/a.png')).toBeNull();
		expect(relativeInside('/home/l/paper', '/home/l/paper')).toBeNull();
		expect(relativeInside('', '/a.png')).toBeNull();
		expect(relativeInside('/root', '')).toBeNull();
	});
});
