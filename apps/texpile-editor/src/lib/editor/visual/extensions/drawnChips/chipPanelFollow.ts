// the open panel keeps to its chip: placed by it as the page scrolls or the chip changes size, closed once the chip has
// scrolled out of its pane or by a press anywhere else, and focused on its first setting, or on the chip's LaTeX
import { chipInPane, chipPanelPlacement } from './chipPanelPlacement';
import { closeChipPanel } from './chipPanel.svelte';
import { scrollingPane } from '$lib/editor/visual/scrollingPane';

/** the pane's box as far as the window shows it */
function paneBox(pane: HTMLElement | null) {
	const screen = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
	if (!pane) return screen;
	const box = pane.getBoundingClientRect();
	return {
		left: Math.max(box.left, screen.left),
		top: Math.max(box.top, screen.top),
		right: Math.min(box.right, screen.right),
		bottom: Math.min(box.bottom, screen.bottom)
	};
}

export function followChip(anchor: HTMLElement) {
	return (card: HTMLElement) => {
		const pane = scrollingPane(anchor);
		function place(): void {
			if (!anchor.isConnected) return;
			const box = paneBox(pane);
			const chip = anchor.getBoundingClientRect();
			if (!chipInPane(chip, box)) {
				closeChipPanel('away');
				return;
			}
			const { x, y } = chipPanelPlacement(chip, card.getBoundingClientRect(), box);
			card.style.setProperty('left', `${x}px`);
			card.style.setProperty('top', `${y}px`);
		}
		function onPointerDown(event: PointerEvent): void {
			const target = event.target as Element;
			if (card.contains(target) || anchor.contains(target)) return;
			// the LaTeX field's completion list and a field's suggestions sit in the body
			if (target.closest?.('.cm-tooltip, [data-suggest-list]')) return;
			closeChipPanel('away');
		}
		const resized = new ResizeObserver(place);
		resized.observe(anchor);
		resized.observe(card);
		document.addEventListener('scroll', place, { capture: true, passive: true });
		window.addEventListener('resize', place);
		document.addEventListener('pointerdown', onPointerDown, true);
		place();
		queueMicrotask(() => {
			const first = card.querySelector<HTMLElement>('[data-autofocus]') ?? card.querySelector<HTMLElement>('.cm-content');
			first?.focus();
			if (first instanceof HTMLInputElement) first.select();
			// a note is added to, not replaced
			if (first instanceof HTMLTextAreaElement) first.setSelectionRange(first.value.length, first.value.length);
		});
		return () => {
			resized.disconnect();
			document.removeEventListener('scroll', place, { capture: true });
			window.removeEventListener('resize', place);
			document.removeEventListener('pointerdown', onPointerDown, true);
		};
	};
}
