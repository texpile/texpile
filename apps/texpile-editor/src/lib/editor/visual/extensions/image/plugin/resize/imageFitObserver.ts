// one resize observer for every image. With one each, an image read its width and wrote its size in turn: a layout
// per image on every step of a pane resize
import type { ImageFit } from '../../types';

const fitsOf = new Map<Element, Set<ImageFit>>();
let observer: ResizeObserver | undefined;

function fitAll(entries: ResizeObserverEntry[]): void {
	const due = entries.flatMap((entry) => [...(fitsOf.get(entry.target) ?? [])]);
	const widths = due.map((fit) => fit.measure());
	due.forEach((fit, i) => fit.apply(widths[i]));
}

export function observeImageFit(el: Element, fit: ImageFit): () => void {
	observer ??= new ResizeObserver(fitAll);
	let fits = fitsOf.get(el);
	if (!fits) {
		fitsOf.set(el, (fits = new Set()));
		observer.observe(el);
	}
	fits.add(fit);
	return () => {
		fits.delete(fit);
		if (fits.size > 0) return;
		fitsOf.delete(el);
		observer?.unobserve(el);
	};
}
