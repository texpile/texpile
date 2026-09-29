// the split comparison's revert arrows sit at the middle of their change, not its first line
import type { MergeView } from '@codemirror/merge';

/** the change's middle on screen, from the side that has lines in it (the two sides are aligned) */
function middleOf(mv: MergeView, chunk: number): number {
	const c = mv.chunks[chunk];
	const [view, from, end] = c.fromB < c.toB ? [mv.b, c.fromB, c.endB] : [mv.a, c.fromA, c.endA];
	return view.documentTop + (view.lineBlockAt(from).top + view.lineBlockAt(end).bottom) / 2;
}

export function centerRevertArrows(mv: MergeView): () => void {
	const gap = mv.dom.querySelector<HTMLElement>('.cm-merge-revert');
	if (!gap) return () => {};

	// merge writes each button's `top` (its change's first line) on every measure, so the shift is a
	// transform worked out from that `top`: setting it changes nothing merge or this reads back
	function centerAll() {
		const gapTop = gap!.getBoundingClientRect().top;
		for (const button of gap!.querySelectorAll<HTMLElement>('[data-chunk]')) {
			const chunk = Number(button.dataset.chunk);
			if (!mv.chunks[chunk]) continue;
			const pinned = gapTop + parseFloat(button.style.top) + button.offsetHeight / 2;
			const shift = `translateY(${Math.round(middleOf(mv, chunk) - pinned)}px)`;
			if (button.style.transform !== shift) button.style.setProperty('transform', shift);
		}
	}

	const moved = new MutationObserver(centerAll);
	moved.observe(gap, { childList: true, subtree: true, attributeFilter: ['style'] });
	const resized = new ResizeObserver(centerAll);
	resized.observe(gap);
	return () => {
		moved.disconnect();
		resized.disconnect();
	};
}
