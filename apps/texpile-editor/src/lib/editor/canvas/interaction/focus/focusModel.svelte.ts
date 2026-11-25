// where focus is for one editor (11.9): its own input surface, an overlay it anchored, or elsewhere
import type { InputSurface } from '../../contracts/inputTypes';

export type FocusPlace = 'editor' | 'overlay' | 'away';

/** an overlay the editor anchored keeps the editor's selection painted while it has focus */
const OVERLAY_SELECTOR = '.canvas-overlay-layer, [data-canvas-overlay]';

export class FocusModel {
	place = $state<FocusPlace>('away');
	private readonly listen: () => void;

	constructor(
		private readonly root: HTMLElement,
		private readonly surface: InputSurface
	) {
		const doc = root.ownerDocument;
		this.listen = (): void => {
			this.refresh();
		};
		doc.addEventListener('focusin', this.listen);
		doc.addEventListener('focusout', this.listen);
		doc.defaultView?.addEventListener('blur', this.listen);
		this.refresh();
	}

	refresh(): FocusPlace {
		const place = this.current();
		// the blur of a view Svelte is tearing down arrives inside its effect, where state may not be written
		if (place !== this.place) queueMicrotask(() => (this.place = this.current()));
		return place;
	}

	private current(): FocusPlace {
		const active = this.root.ownerDocument.activeElement;
		return this.surface.hasFocus() ? 'editor' : active?.closest(OVERLAY_SELECTOR) ? 'overlay' : 'away';
	}

	destroy(): void {
		const doc = this.root.ownerDocument;
		doc.removeEventListener('focusin', this.listen);
		doc.removeEventListener('focusout', this.listen);
		doc.defaultView?.removeEventListener('blur', this.listen);
	}
}
