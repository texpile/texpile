// @vitest-environment jsdom
// The editor is invisible while it builds, and every heavy node inside it starts as a cheap
// stand-in: a chip is its own source as plain text, a formula is a blank box. Revealing the instant
// the build ends therefore showed a document made entirely of stand-ins, which read as a flash of
// source before the real thing.
//
// The reveal now measures instead of waiting: it upgrades what the reader can actually see, then
// shows the editor. These hold the measurement, which is the whole mechanism - upgrade what is on
// screen, leave the rest to the observer, and never mistake "has no box" for "sits at the origin".
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

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

beforeAll(() => {
	globalThis.IntersectionObserver = FakeIntersectionObserver as never;
});

const { upgradeWhenNear, cancelUpgrade, upgradeVisibleNow } = await import('$lib/editor/visual/extensions/mathlivebridge/mathViewport');
const { revealBuiltEditor, BUILDING_CLASS } = await import('$lib/editor/visual/revealBuiltEditor');

/** jsdom gives every element a zero rect, so a node has to be told where it is */
function nodeAt(top: number, height = 20): HTMLElement {
	const el = document.createElement('span');
	el.getBoundingClientRect = () => ({ top, bottom: top + height, left: 0, right: 100, width: 100, height }) as DOMRect;
	return el;
}

beforeEach(() => {
	watched.clear();
});

describe('upgrading what is on screen', () => {
	it('upgrades a node the reader can see', () => {
		const upgrade = vi.fn();
		upgradeWhenNear(nodeAt(100), upgrade);

		upgradeVisibleNow();

		expect(upgrade).toHaveBeenCalled();
	});

	// the observer's rootMargin is a screen and a half either side; the reveal owes only the screen
	it('leaves a node below the fold for the observer to pick up', () => {
		const el = nodeAt(window.innerHeight + 500);
		const upgrade = vi.fn();
		upgradeWhenNear(el, upgrade);

		upgradeVisibleNow();

		expect(upgrade).not.toHaveBeenCalled();
		expect(watched.has(el)).toBe(true);
		cancelUpgrade(el);
	});

	// a zero rect means an ancestor is display:none - reading it as "at the origin, therefore
	// visible" would upgrade an entire hidden document at once
	it('does not mistake a node with no box for one at the top of the screen', () => {
		const upgrade = vi.fn();
		upgradeWhenNear(document.createElement('span'), upgrade);

		upgradeVisibleNow();

		expect(upgrade).not.toHaveBeenCalled();
	});

	it('upgrades each node once, however often it is asked', () => {
		const upgrade = vi.fn();
		upgradeWhenNear(nodeAt(50), upgrade);

		upgradeVisibleNow();
		upgradeVisibleNow();

		expect(upgrade).toHaveBeenCalledTimes(1);
	});
});

describe('the reveal', () => {
	// no await anywhere: the reveal is synchronous, which is what lets it happen before the paint
	// that would otherwise show the stand-ins
	it('shows the editor with what is on screen already upgraded', () => {
		const el = document.createElement('main');
		el.className = BUILDING_CLASS;
		const upgrade = vi.fn();
		upgradeWhenNear(nodeAt(10), upgrade);

		revealBuiltEditor(el);

		expect(upgrade).toHaveBeenCalled();
		expect(el.classList.contains(BUILDING_CLASS)).toBe(false);
	});

	it('survives being handed no element, rather than taking the mount down with it', () => {
		expect(() => revealBuiltEditor(null)).not.toThrow();
	});
});
