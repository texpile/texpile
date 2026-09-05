/** Fade-and-lift a block the first time it scrolls into view.
 *
 * Nothing is hidden until the page has actually scrolled. At mount a block is only registered.
 * The first scroll event adds the `reveal` pre-state (opacity 0, in app.css behind `.js` and a
 * reduced-motion guard) to the blocks that are still off screen, and later scrolls clear it as
 * each one arrives. A visitor who never scrolls, a crawler that renders without scrolling, and a
 * headless context where requestAnimationFrame never fires all see the whole page. Hiding at
 * mount got the home page marked as a soft 404 by Google, since Googlebot does not scroll.
 *
 * Deliberately NOT built on IntersectionObserver. IO is throttled or silent in background tabs,
 * some embedded webviews, and non-compositing contexts, and it can deliver one callback and
 * then go quiet. A single shared scroll listener reading rects is a few lines, costs almost
 * nothing at this scale, and is true whenever the page has actually scrolled.
 */

/** blocks waiting to arrive: stagger delay in ms, and whether the pre-state has been applied */
const pending = new Map<HTMLElement, { delay: number; hidden: boolean }>();
let listening = false;
let frame = 0;
let hideNew = false;

/** Reveal a little before the block is fully on screen, so the motion reads as "arriving". */
const MARGIN = 0.12;

function sweep() {
	frame = 0;
	const limit = window.innerHeight * (1 - MARGIN);
	for (const [node, state] of pending) {
		const r = node.getBoundingClientRect();
		const onScreen = r.top < window.innerHeight && r.bottom > 0;
		if (!state.hidden) {
			// still untouched: leave anything on screen alone for good, hide the rest for its entrance
			if (!hideNew) continue;
			if (onScreen) pending.delete(node);
			else {
				// commit the hidden state in one step, so a block near the fold does not fade out on screen
				node.style.transition = 'none';
				node.classList.add('reveal');
				void node.offsetWidth;
				node.style.removeProperty('transition');
				if (state.delay) node.style.transitionDelay = `${state.delay}ms`;
				state.hidden = true;
			}
		} else if (r.top < limit && r.bottom > 0) {
			node.classList.add('shown');
			pending.delete(node);
			// clear the stagger so a later re-entry doesn't wait again
			setTimeout(() => node.style.removeProperty('transition-delay'), 800);
		}
	}
	hideNew = false;
	if (pending.size === 0) stop();
}

function schedule(hide: boolean) {
	hideNew ||= hide;
	if (frame) return;
	frame = requestAnimationFrame(sweep);
}

// only a scroll may hide: a resize (which crawlers use to lengthen the viewport) can only show
const onScroll = () => schedule(true);
const onResize = () => schedule(false);

function stop() {
	if (!listening) return;
	listening = false;
	window.removeEventListener('scroll', onScroll);
	window.removeEventListener('resize', onResize);
}

function start() {
	if (listening) return;
	listening = true;
	window.addEventListener('scroll', onScroll, { passive: true });
	window.addEventListener('resize', onResize, { passive: true });
}

export function reveal(node: HTMLElement, delay = 0) {
	// motion is unwanted: never register it
	if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

	pending.set(node, { delay, hidden: false });
	start();

	return {
		destroy() {
			pending.delete(node);
			if (pending.size === 0) stop();
		}
	};
}
