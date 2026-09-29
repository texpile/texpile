// the split comparison's hidden unchanged lines as one bar across both sides and the gap, not a bar
// per side: the same lines are hidden on both. Merge's own bars keep their room underneath, and a
// click on the joined bar is a click on the working copy's, which opens both sides
import type { MergeView } from '@codemirror/merge';

export function joinCollapsedBars(mv: MergeView): () => void {
	const editors = mv.dom.querySelector<HTMLElement>('.cm-mergeViewEditors');
	if (!editors) return () => {};
	let bars: HTMLElement[] = [];
	let frame = 0;

	function place() {
		frame = 0;
		for (const bar of bars) bar.remove();
		const box = editors!.getBoundingClientRect();
		const left = mv.a.contentDOM.getBoundingClientRect().left - box.left;
		bars = [...mv.b.contentDOM.querySelectorAll<HTMLElement>('.cm-collapsedLines')].map((hidden) => {
			const at = hidden.getBoundingClientRect();
			const bar = document.createElement('div');
			bar.className = 'diff-collapsed-bar';
			bar.textContent = hidden.textContent;
			bar.style.cssText = `top: ${at.top - box.top}px; height: ${at.height}px; left: ${left}px; right: ${box.right - at.right}px`;
			bar.addEventListener('click', () => hidden.click());
			editors!.append(bar);
			return bar;
		});
	}

	function schedule() {
		if (!frame) frame = requestAnimationFrame(place);
	}

	// the bars come and go with the lines each side draws, and move when anything above them changes height
	const drawn = new MutationObserver(schedule);
	for (const view of [mv.a, mv.b]) drawn.observe(view.contentDOM, { childList: true, subtree: true });
	const resized = new ResizeObserver(schedule);
	resized.observe(editors);
	schedule();
	return () => {
		cancelAnimationFrame(frame);
		drawn.disconnect();
		resized.disconnect();
		for (const bar of bars) bar.remove();
	};
}
