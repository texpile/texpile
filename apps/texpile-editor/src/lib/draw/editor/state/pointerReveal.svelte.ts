const REACH_PX = 40;

type RevealBox = { left: number; top: number; right: number; bottom: number };

export function pointerNearPanels(x: number, y: number, box: RevealBox): boolean {
	return x <= box.right + REACH_PX && y >= box.top - REACH_PX && y <= box.bottom + REACH_PX;
}

export function pointerNearBox(x: number, y: number, box: RevealBox): boolean {
	return x >= box.left - REACH_PX && pointerNearPanels(x, y, box);
}

export class PointerReveal {
	near = $state(false);
	focused = $state(false);

	constructor(private readonly isNear: (x: number, y: number, box: RevealBox) => boolean) {}

	// a field going with its panel fires this during Svelte's teardown, where state cannot change
	private focusLeft(inside: boolean): void {
		queueMicrotask(() => (this.focused = inside));
	}

	attach = (el: HTMLElement) => {
		const stage = el.parentElement;
		if (!stage) return;
		const focusIn = () => (this.focused = true);
		const focusOut = (e: FocusEvent) => this.focusLeft(el.contains(e.relatedTarget as Node | null));
		el.addEventListener('focusin', focusIn);
		el.addEventListener('focusout', focusOut);
		const moved = (e: PointerEvent) => {
			if (!e.buttons) this.near = this.isNear(e.clientX, e.clientY, el.getBoundingClientRect());
		};
		const left = () => (this.near = false);
		stage.addEventListener('pointermove', moved, true);
		stage.addEventListener('pointerleave', left);
		return () => {
			stage.removeEventListener('pointermove', moved, true);
			stage.removeEventListener('pointerleave', left);
			el.removeEventListener('focusin', focusIn);
			el.removeEventListener('focusout', focusOut);
		};
	};
}
