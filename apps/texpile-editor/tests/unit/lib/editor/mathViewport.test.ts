// @vitest-environment jsdom
// The upgrade scheduler behind viewport materialization. The fallback case matters most: where
// IntersectionObserver is missing there must be no deferral at all, because a placeholder that is
// never upgraded is a document you cannot edit.
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Entry = { target: Element; isIntersecting: boolean };
type Cb = (entries: Entry[], obs: unknown) => void;

const watched = new Map<Element, { cb: Cb; obs: unknown }>();

class FakeIntersectionObserver {
	constructor(private cb: Cb) {}
	observe(el: Element) {
		watched.set(el, { cb: this.cb, obs: this });
	}
	unobserve(el: Element) {
		watched.delete(el);
	}
	disconnect() {
		watched.clear();
	}
}

function comeIntoView(el: Element) {
	const rec = watched.get(el);
	if (!rec) throw new Error('element is not being observed');
	rec.cb([{ target: el, isIntersecting: true }], rec.obs);
}

beforeEach(() => {
	watched.clear();
	vi.resetModules();
	globalThis.IntersectionObserver = FakeIntersectionObserver as unknown as typeof IntersectionObserver;
});

describe('upgradeWhenNear', () => {
	it('waits rather than upgrading on the spot', async () => {
		const { upgradeWhenNear } = await import('$lib/editor/extensions/mathlivebridge/mathViewport');
		const el = document.createElement('div');
		const upgrade = vi.fn();
		upgradeWhenNear(el, upgrade);
		expect(upgrade).not.toHaveBeenCalled();
		expect(watched.has(el)).toBe(true);
	});

	it('upgrades when the element comes near the viewport', async () => {
		const { upgradeWhenNear } = await import('$lib/editor/extensions/mathlivebridge/mathViewport');
		const el = document.createElement('div');
		const upgrade = vi.fn();
		upgradeWhenNear(el, upgrade);
		comeIntoView(el);
		expect(upgrade).toHaveBeenCalledTimes(1);
	});

	it('stops watching once upgraded, so scrolling past again cannot rebuild the field', async () => {
		const { upgradeWhenNear } = await import('$lib/editor/extensions/mathlivebridge/mathViewport');
		const el = document.createElement('div');
		const upgrade = vi.fn();
		upgradeWhenNear(el, upgrade);
		comeIntoView(el);
		expect(watched.has(el)).toBe(false);
		expect(upgrade).toHaveBeenCalledTimes(1);
	});

	it('ignores an element leaving the viewport', async () => {
		const { upgradeWhenNear } = await import('$lib/editor/extensions/mathlivebridge/mathViewport');
		const el = document.createElement('div');
		const upgrade = vi.fn();
		upgradeWhenNear(el, upgrade);
		const rec = watched.get(el)!;
		rec.cb([{ target: el, isIntersecting: false }], rec.obs);
		expect(upgrade).not.toHaveBeenCalled();
	});

	it('cancelUpgrade drops a pending element without running it', async () => {
		const { upgradeWhenNear, cancelUpgrade } = await import('$lib/editor/extensions/mathlivebridge/mathViewport');
		const el = document.createElement('div');
		const upgrade = vi.fn();
		upgradeWhenNear(el, upgrade);
		cancelUpgrade(el);
		expect(watched.has(el)).toBe(false);
		expect(upgrade).not.toHaveBeenCalled();
	});

	it('cancelUpgrade is safe on an element that was never observed', async () => {
		const { cancelUpgrade } = await import('$lib/editor/extensions/mathlivebridge/mathViewport');
		expect(() => cancelUpgrade(document.createElement('div'))).not.toThrow();
	});

	it('upgrades immediately when IntersectionObserver is unavailable', async () => {
		delete (globalThis as Partial<typeof globalThis>).IntersectionObserver;
		vi.resetModules();
		const { upgradeWhenNear } = await import('$lib/editor/extensions/mathlivebridge/mathViewport');
		const upgrade = vi.fn();
		upgradeWhenNear(document.createElement('div'), upgrade);
		expect(upgrade).toHaveBeenCalledTimes(1);
	});
});
