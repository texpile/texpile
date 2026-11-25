// a face that draws again in place when a let it reads changes; one that no longer draws redraws every chip
import { type ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import { appendTo, elementMode, replaceIn } from '$lib/editor/visual/extensions/drawnChips/faces/partElements';
import { typstElement } from '../looks/typstLooks';
import { onTypstScope, redrawEveryTypstChipSoon } from './fileScopeNow.svelte';

export function faceFollowingScope(
	first: ChipFace,
	draw: () => ChipFace | null,
	reads: (changed: ReadonlySet<string>) => boolean
): ChipFace {
	const mode = elementMode(typstElement);
	const dom = mode.make(first.line || first.dom.tagName.toLowerCase() === 'div' ? 'div' : 'span');
	let drawn = first;
	appendTo(dom, mode.ofFace(first));
	const stop = onTypstScope((changed) => {
		if (!changed || !reads(changed)) return;
		const next = draw();
		if (!next) {
			redrawEveryTypstChipSoon();
			return;
		}
		if (next.dom.innerHTML === drawn.dom.innerHTML) {
			next.destroy?.();
			return;
		}
		drawn.destroy?.();
		drawn = next;
		replaceIn(dom, mode.ofFace(next));
	});
	return {
		dom,
		line: first.line,
		mixed: first.mixed,
		character: first.character,
		decorate: (decorations) => drawn.decorate?.(decorations),
		destroy() {
			stop();
			drawn.destroy?.();
		}
	};
}
