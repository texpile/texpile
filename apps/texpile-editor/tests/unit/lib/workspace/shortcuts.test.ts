// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

const store = { path: '/w/gone.tex' as string | null };
vi.mock('$lib/workspace/workspaceStore', () => ({
	activeFilePath: {
		get current() {
			return store.path;
		}
	},
	activeCompare: { current: null }
}));

const { createKeydownHandler } = await import('$lib/workspace/shortcuts');

function ctrlW() {
	return { ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, key: 'w', preventDefault: () => {} } as KeyboardEvent;
}

describe('Ctrl+W', () => {
	// the document buffer drops its path when a file fails to load; the tab is still there
	it('closes the focused tab even when no document is loaded', () => {
		const closeTab = vi.fn();
		const handle = createKeydownHandler({
			closeTab,
			isGuest: () => false,
			save: () => {},
			toggleGlobalSearch: () => {},
			terminalAvailable: () => false,
			isCompiling: () => false,
			runCompile: () => {},
			stopCompile: () => {}
		});
		handle(ctrlW());
		expect(closeTab).toHaveBeenCalledWith({ path: '/w/gone.tex', compare: undefined });
	});
});
