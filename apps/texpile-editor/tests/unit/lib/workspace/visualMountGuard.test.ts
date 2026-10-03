// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { noteVisualMount, visualMounted, visualMountDied } from '$lib/workspace/visualMountGuard';

vi.mock('$lib/platform', () => ({ isMac: false, isWindows: true }));

beforeEach(() => localStorage.clear());

describe('visualMountGuard', () => {
	it('a note left behind reports the death once, for that file only', () => {
		noteVisualMount('C:\\ws\\huge.tex');
		expect(visualMountDied('C:/ws/other.tex')).toBe(false);
		expect(visualMountDied('c:/ws/huge.tex')).toBe(true);
		expect(visualMountDied('c:/ws/huge.tex')).toBe(false);
	});

	it('a build that finished leaves nothing behind', () => {
		noteVisualMount('C:/ws/paper.tex');
		visualMounted('c:\\ws\\paper.tex');
		expect(visualMountDied('C:/ws/paper.tex')).toBe(false);
	});

	it('another file finishing its build does not clear the note', () => {
		noteVisualMount('C:/ws/huge.tex');
		visualMounted('C:/ws/small.tex');
		expect(visualMountDied('C:/ws/huge.tex')).toBe(true);
	});
});
