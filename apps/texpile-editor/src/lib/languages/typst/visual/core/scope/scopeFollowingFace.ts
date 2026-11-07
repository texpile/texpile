// a face that draws again in place when a let it reads changes; one that no longer draws redraws every chip
import type { ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import { onTypstScope, redrawEveryTypstChipSoon } from './fileScopeNow.svelte';

/** `reads` says whether the drawing reads one of the lets that changed */
export function faceFollowingScope(
	first: ChipFace,
	draw: () => ChipFace | null,
	reads: (changed: ReadonlySet<string>) => boolean
): ChipFace {
	const dom = document.createElement(first.line || first.dom.tagName === 'DIV' ? 'div' : 'span');
	let drawn = first;
	dom.appendChild(first.dom);
	// a change of imports draws every chip again anyway
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
		dom.replaceChildren(next.dom);
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
