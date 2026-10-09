import { untrack } from 'svelte';

// A menu hung below a toolbar button. Fixed-positioned in the toolbar's own DOM rather than
// portalled: this bar can live in the popped-out preview window, and a portal lands in the
// opener's document. Measured and dismissed against the button's own window for the same reason.
export class AnchoredMenu {
	button = $state<HTMLElement>();
	el = $state<HTMLElement>();
	open = $state(false);
	private pos = $state({ top: 0, x: 0 });

	constructor(private readonly align: 'start' | 'end' = 'end') {
		this.attachDismiss();
		this.keepInWindow();
	}

	/** inline style for the menu element; `end` anchors its right edge under the button's */
	get style(): string {
		return `top: ${this.pos.top}px; ${this.align === 'end' ? 'right' : 'left'}: ${this.pos.x}px`;
	}

	toggle = () => {
		if (!this.open && this.button) {
			const r = this.button.getBoundingClientRect();
			const vw = this.button.ownerDocument.defaultView?.innerWidth ?? window.innerWidth;
			this.pos = { top: r.bottom + 4, x: this.align === 'end' ? Math.max(4, vw - r.right) : Math.max(4, r.left) };
		}
		this.open = !this.open;
	};

	close = () => {
		this.open = false;
	};

	// a narrow preview, or the popped-out window, leaves less room than the menu is wide
	private keepInWindow(): void {
		$effect(() => {
			if (!this.open || !this.el) return;
			const vw = this.el.ownerDocument.defaultView?.innerWidth ?? window.innerWidth;
			const r = this.el.getBoundingClientRect();
			if (r.left >= 4 && r.right <= vw - 4) return;
			const x = Math.max(4, vw - 4 - r.width);
			untrack(() => {
				if (this.pos.x !== x) this.pos = { ...this.pos, x };
			});
		});
	}

	private attachDismiss(): void {
		// Dismiss on any pointer down outside, and on Escape. Not a scrim element: a scrim only
		// intercepts clicks if it paints above everything, and inside a component it competes in
		// whatever stacking context it lands in - the PDF canvas painted over it and ate the click.
		$effect(() => {
			if (!this.open) return;
			const onDown = (e: PointerEvent) => {
				const t = e.target as Node | null;
				if (t && (this.el?.contains(t) || this.button?.contains(t))) return;
				this.open = false;
			};
			const onKey = (e: KeyboardEvent) => {
				if (e.key === 'Escape') this.open = false;
			};
			const win = this.button?.ownerDocument.defaultView ?? window;
			win.addEventListener('pointerdown', onDown, true);
			win.addEventListener('keydown', onKey, true);
			return () => {
				win.removeEventListener('pointerdown', onDown, true);
				win.removeEventListener('keydown', onKey, true);
			};
		});
	}
}
