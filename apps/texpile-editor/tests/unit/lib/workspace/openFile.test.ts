// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { activeCompare, activeFilePath, openFile } from '$lib/workspace/workspaceStore';

const VERSION = { hash: 'abc123', subject: 'Add the results section' };

afterEach(() => {
	activeCompare.current = null;
	activeFilePath.current = null;
});

describe('openFile', () => {
	it('leaves the comparison that was on screen', () => {
		activeCompare.current = VERSION;
		activeFilePath.current = '/proj/results.tex';

		openFile('/proj/intro.tex');

		expect(activeFilePath.current).toBe('/proj/intro.tex');
		expect(activeCompare.current).toBeNull();
	});

	it('leaves it even when the file opened is the one being compared', () => {
		activeCompare.current = VERSION;
		activeFilePath.current = '/proj/results.tex';

		openFile('/proj/results.tex');

		expect(activeCompare.current).toBeNull();
	});

	it('clears the comparison before the path write, not after', () => {
		activeCompare.current = VERSION;
		activeFilePath.current = '/proj/results.tex';
		let comparingDuringWrite: unknown = 'unset';
		const stop = activeFilePath.onWrite(() => (comparingDuringWrite = activeCompare.current));

		openFile('/proj/intro.tex');
		stop();

		expect(comparingDuringWrite).toBeNull();
	});

	it('closing the last file clears it too', () => {
		activeCompare.current = VERSION;
		activeFilePath.current = '/proj/results.tex';

		openFile(null);

		expect(activeFilePath.current).toBeNull();
		expect(activeCompare.current).toBeNull();
	});
});
