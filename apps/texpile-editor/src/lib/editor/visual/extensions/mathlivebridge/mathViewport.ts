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

/** Strong, not weak, so upgradeVisibleNow can enumerate it. What keeps this from holding detached
 *  elements alive is that every node view calls cancelUpgrade from its destroy. */
const pending = new Map<Element, Upgrade>();
let observer: IntersectionObserver | null = null;

function ensureObserver(): IntersectionObserver | null {
	if (typeof IntersectionObserver === 'undefined') return null;
	observer ??= new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (entry.isIntersecting) upgradeNow(entry.target);
			}
		},
		{ rootMargin: UPGRADE_MARGIN }
	);
	return observer;
}

function upgradeNow(el: Element): void {
	const upgrade = pending.get(el);
	if (!upgrade) return;
	// drop it first: upgrading is one-way, and re-entry here would rebuild a live field
	pending.delete(el);
	observer?.unobserve(el);
	upgrade();
}

/**
 * Upgrade everything on screen right now, synchronously.
 *
 * The observer cannot answer this question. It reports at the END of a rendering pass, so a caller
 * that needs the visible half real before the next paint - revealing a freshly built editor - can
 * only wait for a delivery and hope that delivery was the screenful. Measuring says it outright,
 * which is why this needs no timeout to stay safe.
 *
 * The viewport here is the true one, not UPGRADE_MARGIN's screen and a half either side: a reveal
 * owes the reader what they can see, and the margin is pre-warming that belongs after it.
 */
export function upgradeVisibleNow(): void {
	if (pending.size === 0) return;
	const vh = window.innerHeight;
	const vw = window.innerWidth;
	// every rect read before any upgrade: interleaving the two would force a layout per element
	// rather than one for the batch
	const visible = [...pending.keys()].filter((el) => {
		const r = el.getBoundingClientRect();
		// no box at all means an ancestor is display:none, not that this sits at the origin
		if (r.width === 0 && r.height === 0) return false;
		return r.bottom >= 0 && r.top <= vh && r.right >= 0 && r.left <= vw;
	});
	for (const el of visible) upgradeNow(el);
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
