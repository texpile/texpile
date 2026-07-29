// One shared IntersectionObserver that turns math placeholders into live MathfieldElements as they
// approach the viewport.
//
// Why visibility and not focus: an earlier attempt at this upgraded inline latex chips on focus,
// which meant anything you could actually see was still in its cheap unupgraded form. Keying off
// visibility inverts that - whatever is on screen is always the real thing, and only what you
// cannot see stays cheap.
//
// root is left null (the browser viewport). Intersection against the viewport already accounts for
// clipping by ancestor scroll containers, so this needs no wiring to the editor's scroll element
// and keeps working if that element ever moves.

/** ~1.5 screens of lead, so a node finishes upgrading well before it scrolls into sight */
const UPGRADE_MARGIN = '150% 0px';

type Upgrade = () => void;

const pending = new WeakMap<Element, Upgrade>();
let observer: IntersectionObserver | null = null;

function ensureObserver(): IntersectionObserver | null {
	if (typeof IntersectionObserver === 'undefined') return null;
	observer ??= new IntersectionObserver(
		(entries, obs) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				const upgrade = pending.get(entry.target);
				if (!upgrade) continue;
				// drop it first: upgrading is one-way, and re-entry here would rebuild a live field
				pending.delete(entry.target);
				obs.unobserve(entry.target);
				upgrade();
			}
		},
		{ rootMargin: UPGRADE_MARGIN }
	);
	return observer;
}

/** run `upgrade` once `el` comes near the viewport. Upgrades immediately where IntersectionObserver
 * is missing (jsdom, SSR), which reproduces the old eager behaviour rather than rendering nothing. */
export function upgradeWhenNear(el: Element, upgrade: Upgrade): void {
	const obs = ensureObserver();
	if (!obs) {
		upgrade();
		return;
	}
	pending.set(el, upgrade);
	obs.observe(el);
}

/** stop watching `el`; safe to call whether or not it was ever observed or already upgraded */
export function cancelUpgrade(el: Element): void {
	pending.delete(el);
	observer?.unobserve(el);
}
