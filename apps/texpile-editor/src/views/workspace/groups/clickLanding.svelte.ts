// A parked slot takes no caret and no typing until its file is open and drawn: the click that woke it lands
// then, and the letters typed in between go in after it, as they would have in a slot already focused
import { caretAtPoint, typeAtCaret, type GroupClick } from './caretAtPoint';
import { windowOf } from '$lib/childWindows/childWindowRegistry.svelte';

type LandingDeps = { cell: (id: number) => HTMLElement | undefined; live: (id: number) => boolean; exists: (id: number) => boolean };

// a live slot with no text to land in (a figure tab) holds the keys no longer than this
const LIVE_FRAMES = 30;

/** called during component init: it runs effects */
export function clickLanding(d: LandingDeps) {
	let pending = $state<{ at: GroupClick; id: number } | null>(null);
	let typed = '';

	// plain letters only: a shortcut, Enter or a composition goes where it goes
	function hold(e: KeyboardEvent): void {
		if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
		if (e.key === 'Backspace' && typed) typed = typed.slice(0, -1);
		else if (e.key.length === 1) typed += e.key;
		else return;
		e.preventDefault();
		e.stopPropagation();
	}
	$effect(() => {
		if (!pending) return;
		// the window the slot is in, which may be one of its own
		const win = windowOf(d.cell(pending.id));
		win.addEventListener('keydown', hold, true);
		return () => win.removeEventListener('keydown', hold, true);
	});

	$effect(() => {
		const click = pending;
		if (click && !d.exists(click.id)) pending = null;
		if (!click || !d.live(click.id)) return;
		let tries = 0;
		let frame = requestAnimationFrame(function land(): void {
			const node = d.cell(click.id);
			const landed = !!node && caretAtPoint(click.at, node);
			if (!landed && ++tries < LIVE_FRAMES) {
				frame = requestAnimationFrame(land);
				return;
			}
			if (landed && typed) typeAtCaret(typed, node);
			typed = '';
			pending = null;
		});
		return () => cancelAnimationFrame(frame);
	});

	return {
		start(at: GroupClick, id: number): void {
			typed = '';
			pending = { at, id };
		},
		clear(): void {
			pending = null;
		}
	};
}
