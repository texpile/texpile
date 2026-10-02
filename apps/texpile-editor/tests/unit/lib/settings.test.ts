import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// force the browser branch and stub the Electron native bridge
vi.mock('$lib/runtime', () => ({ browser: true }));

// a window as much as userData's storage listener and the native bridge need
function stubWindow(texpileNative: unknown) {
	(globalThis as { window?: unknown }).window = { texpileNative, addEventListener: () => {} };
}

describe('settings hydration (auto-reopen depends on this)', () => {
	beforeEach(() => {
		vi.resetModules();
	});
	afterEach(() => {
		delete (globalThis as { window?: unknown }).window;
	});

	it('getSettings() waits for the async native read instead of returning defaults early', async () => {
		// the native read resolves on a later tick, the exact case the old boolean flag mishandled
		stubWindow({
			getSettings: () => new Promise((r) => setTimeout(() => r({ openFolders: ['/saved/project'], reopenLastFolder: true }), 15)),
			setSettings: () => Promise.resolve()
		});
		const { getSettings } = await import('../../../src/lib/settings');
		const s = await getSettings();
		expect(s.openFolders).toEqual(['/saved/project']); // regression guard for the reopen-last-folder bug
		expect(s.reopenLastFolder).toBe(true);
	});

	it('memoizes the load: concurrent callers share one native read and all see the value', async () => {
		let calls = 0;
		stubWindow({
			getSettings: () => {
				calls++;
				return Promise.resolve({ lastFolder: '/x' });
			},
			setSettings: () => Promise.resolve()
		});
		const { loadSettings } = await import('../../../src/lib/settings');
		const [a, b] = await Promise.all([loadSettings(), loadSettings()]);
		expect(a.openFolders).toEqual(['/x']);
		expect(b.openFolders).toEqual(['/x']);
		expect(calls).toBe(1); // one read, shared (the eager module-load hydrate)
	});

	it('applies a persisted uiLocale to the Paraglide runtime, not just the settings store', async () => {
		stubWindow({
			getSettings: () => Promise.resolve({ uiLocale: 'zh-Hans' }),
			setSettings: () => Promise.resolve()
		});
		const { loadSettings } = await import('../../../src/lib/settings');
		const { getLocale } = await import('../../../src/lib/paraglide/runtime');
		const s = await loadSettings();
		expect(s.uiLocale).toBe('zh-Hans');
		expect(getLocale()).toBe('zh-Hans'); // regression guard: the two must not drift apart
	});

	it('defaults uiLocale to en when nothing is persisted', async () => {
		stubWindow({ getSettings: () => Promise.resolve({}), setSettings: () => Promise.resolve() });
		const { loadSettings } = await import('../../../src/lib/settings');
		const s = await loadSettings();
		expect(s.uiLocale).toBe('en');
	});

	it('persists only the changed fields, not the whole settings object', async () => {
		// two windows share settings.json; a whole-object write would clobber the other
		// window's fields with this window's stale copies (the multi-window regression)
		const writes: Record<string, unknown>[] = [];
		stubWindow({
			getSettings: () => Promise.resolve({ sidebarWidth: 999 }),
			setSettings: (p: Record<string, unknown>) => {
				writes.push(p);
				return Promise.resolve({});
			}
		});
		const { loadSettings, updateSettings } = await import('../../../src/lib/settings');
		await loadSettings();
		updateSettings({ uiZoom: 1.5 });
		expect(writes.at(-1)).toEqual({ uiZoom: 1.5 });
	});
});
