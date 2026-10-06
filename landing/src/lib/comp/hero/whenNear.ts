/** runs `start` once `el` comes within a screen of the viewport, and returns the teardown of both */
export function whenNear(el: Element, start: () => () => void): () => void {
	let stop: (() => void) | null = null;
	const io = new IntersectionObserver(
		(entries) => {
			if (!entries.some((e) => e.isIntersecting)) return;
			io.disconnect();
			stop = start();
		},
		{ rootMargin: '100% 0px' }
	);
	io.observe(el);
	return () => {
		io.disconnect();
		stop?.();
	};
}
